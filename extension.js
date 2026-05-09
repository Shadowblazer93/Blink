/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const OVERLAY_MAX_SIZE = 160;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(onShowSettings) {
        super._init(0.0, _('My Shiny Indicator'));

        this.add_child(new St.Icon({
            icon_name: 'document-open-recent-symbolic',
            style_class: 'system-status-icon',
        }));

        let item = new PopupMenu.PopupMenuItem(_('Show Settings'));
        item.connect('activate', () => {
            if (onShowSettings)
                onShowSettings();
        });
        this.menu.addMenuItem(item);
    }
});

export default class IndicatorExampleExtension extends Extension {
    _writeDebug(text) {
        try {
            const path = '/tmp/blink-debug.log';
            let existing = '';
            try { existing = GLib.file_get_contents(path)[1] || ''; } catch (e) { existing = ''; }
            const entry = `${new Date().toISOString()} ${text}\n`;
            GLib.file_set_contents(path, existing + entry);
        } catch (e) {
            logError(e, `${this.uuid}: failed to write debug file`);
        }
    }

    enable() {
        this._settings = this.getSettings();
        this._settingsSignals = [
            this._settings.connect('changed::reminder-enabled', () => this._syncReminderOverlay()),
            this._settings.connect('changed::reminder-opacity', () => this._applyReminderOpacity()),
            this._settings.connect('changed::show-icon', () => this._syncIndicator()),
            this._settings.connect('changed::icon-position', () => this._syncIndicator()),
            this._settings.connect('changed::icon-index', () => this._syncIndicator()),
        ];

        this._indicator = null;
        this._position = null;
        this._positionIndex = null;

        this._syncReminderOverlay();
        this._syncIndicator();
    }

    disable() {
        if (this._settingsSignals) {
            for (const signalId of this._settingsSignals)
                this._settings.disconnect(signalId);
            this._settingsSignals = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._destroyOverlay();

        this._settings = null;
        this._position = null;
        this._positionIndex = null;
    }

    _syncReminderOverlay() {
        if (!this._settings)
            return;

        if (this._settings.get_boolean('reminder-enabled')) {
            if (!this._overlayActor)
                this._createOverlay();
            this._applyReminderOpacity();
        } else {
            this._destroyOverlay();
        }
    }

    _applyReminderOpacity() {
        if (!this._settings || !this._overlayActor)
            return;

        const opacityPercent = this._settings.get_int('reminder-opacity');
        const clampedPercent = Math.max(0, Math.min(100, opacityPercent));
        this._overlayActor.opacity = Math.round((clampedPercent / 100) * 255);
    }

    _createOverlay() {
        try { this._writeDebug(`createOverlay this.path=${this.path}`); } catch(e) {}

        if (this._overlayActor)
            return;

        // Start player process for reliable animated overlay (prefer mpv)
        try {
            const script = `${this.path}/scripts/overlay_player.py`;
            const gif = `${this.path}/icons/eye_1.gif`;
            if (Gio.File.new_for_path(gif).query_exists(null)) {
                try {
                    const mpvPath = GLib.find_program_in_path('mpv');
                    if (mpvPath) {
                        const args = [mpvPath,
                            '--no-border',
                            '--ontop',
                            '--loop=inf',
                            '--no-audio',
                            `--autofit=${OVERLAY_MAX_SIZE}`,
                            '--geometry=center',
                            '--no-config',
                            '--really-quiet',
                            gif
                        ];
                        this._player = Gio.Subprocess.new(args, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
                    } else if (Gio.File.new_for_path(script).query_exists(null)) {
                        const python = GLib.find_program_in_path('python3') || '/usr/bin/python3';
                        this._player = Gio.Subprocess.new([python, script, gif, `${OVERLAY_MAX_SIZE}`], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
                    }
                } catch (e) {
                    logError(e, `${this.uuid}: failed to spawn player`);
                }
            }
        } catch (e) {
            logError(e, `${this.uuid}: error starting player`);
        }

        const gifPath = `${this.path}/icons/eye_1.gif`;
        const gifFile = Gio.File.new_for_path(gifPath);

        if (gifFile.query_exists(null) && this._createAnimatedGifOverlay(gifPath)) {
            // Animated overlay is ready.
        } else {
            this._overlayActor = new St.Label({
                text: '👁️',
                reactive: false,
                can_focus: false,
                style: 'font-size: 72px; color: rgba(255, 255, 255, 0.9);',
            });
        }

        this._applyReminderOpacity();

        Main.uiGroup.add_child(this._overlayActor);
        Main.uiGroup.set_child_above_sibling(this._overlayActor, null);

        this._overlaySignals = [
            Main.layoutManager.connect('monitors-changed', () => this._updateOverlayPosition()),
            global.display.connect('workareas-changed', () => this._updateOverlayPosition()),
        ];

        this._updateOverlayPosition();
    }

    _createAnimatedGifOverlay(gifPath) {
        try {
            try { Main.notify(`${this.uuid}: trying animated overlay ${gifPath}`); } catch(e) { logError(e, `${this.uuid}: notify failed`); }
            this._writeDebug(`trying animated overlay ${gifPath}`);
            this._gifAnimation = GdkPixbuf.PixbufAnimation.new_from_file(gifPath);
            this._gifIter = this._gifAnimation.get_iter(null);
            this._overlayActor = new St.Icon({
                reactive: false,
                can_focus: false,
                style: 'opacity: 0.95;',
            });

            this._renderGifFrame();
            return true;
        } catch (error) {
            logError(error, `${this.uuid}: Failed to initialize animated overlay`);
            Main.notify(`${this.uuid}: animated overlay failed: ${error}`);
            this._writeDebug(`animated init failed: ${error}`);
            this._gifAnimation = null;
            this._gifIter = null;
            return false;
        }
    }

    _renderGifFrame() {
        try {
            if (!this._gifIter || !this._overlayActor)
                return;

            let frame = this._gifIter.get_pixbuf();
            if (!frame)
                return;

            const sourceWidth = frame.get_width();
            const sourceHeight = frame.get_height();
            const scale = OVERLAY_MAX_SIZE / Math.max(sourceWidth, sourceHeight);

            if (scale !== 1) {
                const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
                const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
                const scaled = frame.scale_simple(targetWidth, targetHeight, GdkPixbuf.InterpType.BILINEAR);
                if (scaled)
                    frame = scaled;
            }

            const [ok, pngBuffer] = frame.save_to_bufferv('png', [], []);
            if (ok) {
                this._overlayActor.gicon = new Gio.BytesIcon({
                    bytes: new GLib.Bytes(pngBuffer),
                });
                this._overlayActor.set_icon_size(Math.max(frame.get_width(), frame.get_height()));
            }

            this._updateOverlayPosition();

            const delay = Math.max(16, this._gifIter.get_delay_time());
            this._gifTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                if (!this._gifIter || !this._overlayActor)
                    return GLib.SOURCE_REMOVE;

                this._gifIter.advance(null);
                this._renderGifFrame();
                return GLib.SOURCE_REMOVE;
            });
        } catch (err) {
            try { Main.notify(`${this.uuid}: renderGif error: ${err}`); } catch(e) { logError(e, `${this.uuid}: notify failed`); }
            logError(err, `${this.uuid}: renderGifFrame failed`);
            this._writeDebug(`renderGifFrame failed: ${err}`);
            // Fallback: destroy any partial state so we show emoji fallback next time
            if (this._gifTimeoutId) { GLib.Source.remove(this._gifTimeoutId); this._gifTimeoutId = 0; }
            this._gifAnimation = null;
            this._gifIter = null;
            return;
        }
    }

    _destroyOverlay() {
        if (this._gifTimeoutId) {
            GLib.Source.remove(this._gifTimeoutId);
            this._gifTimeoutId = 0;
        }

        if (this._overlaySignals) {
            Main.layoutManager.disconnect(this._overlaySignals[0]);
            global.display.disconnect(this._overlaySignals[1]);
            this._overlaySignals = null;
        }

        if (this._overlayActor) {
            this._overlayActor.destroy();
            this._overlayActor = null;
        }

        this._gifAnimation = null;
        this._gifIter = null;

        if (this._player) {
            try { this._player.force_exit(); } catch (e) { logError(e, `${this.uuid}: failed to kill player`); }
            this._player = null;
        }
    }

    _updateOverlayPosition() {
        if (!this._overlayActor)
            return;

        let monitor = Main.layoutManager.primaryMonitor;
        // Fallback: use first monitor in layoutManager if primary is not ready
        if (!monitor && Main.layoutManager.monitors && Main.layoutManager.monitors.length > 0)
            monitor = Main.layoutManager.monitors[0];

        // Final fallback: use stage size if monitors are not yet available
        if (!monitor) {
            try {
                const w = global.stage ? global.stage.get_width() : 1920;
                const h = global.stage ? global.stage.get_height() : 1080;
                monitor = { x: 0, y: 0, width: w, height: h };
            } catch (e) {
                monitor = { x: 0, y: 0, width: 1920, height: 1080 };
            }
        }

        const [, naturalWidth] = this._overlayActor.get_preferred_width(-1);
        const [, naturalHeight] = this._overlayActor.get_preferred_height(-1);

        const x = monitor.x + Math.floor((monitor.width - naturalWidth) / 2);
        const y = monitor.y + Math.floor((monitor.height - naturalHeight) / 2);

        try {
            this._overlayActor.set_position(x, y);
            Main.uiGroup.set_child_above_sibling(this._overlayActor, null);
        } catch (e) {
            logError(e, `${this.uuid}: failed to position overlay`);
        }
    }

    _syncIndicator() {
        const showIcon = this._settings.get_boolean('show-icon');

        if (!showIcon) {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
            }
            this._position = null;
            this._positionIndex = null;
            return;
        }

        let position = this._settings.get_string('icon-position');
        if (!['left', 'center', 'right'].includes(position))
            position = 'right';

        let positionIndex = this._settings.get_int('icon-index');

        if (this._indicator && (this._position !== position || this._positionIndex !== positionIndex)) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (!this._indicator) {
            this._indicator = new Indicator(() => this.openPreferences());
            Main.panel.addToStatusArea(this.uuid, this._indicator, positionIndex, position);
            this._position = position;
            this._positionIndex = positionIndex;
        }
    }
}
