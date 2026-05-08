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
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
    enable() {
        this._settings = this.getSettings();
        this._settingsSignals = [
            this._settings.connect('changed::show-icon', () => this._syncIndicator()),
            this._settings.connect('changed::icon-position', () => this._syncIndicator()),
            this._settings.connect('changed::icon-index', () => this._syncIndicator()),
        ];

        this._indicator = null;
        this._position = null;
        this._positionIndex = null;
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

        this._settings = null;
        this._position = null;
        this._positionIndex = null;
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
