import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const OVERLAY_MAX_SIZE = 160;

const BlinkPreviewBox = GObject.registerClass(
class BlinkPreviewBox extends Gtk.Box {
    constructor(extensionPath, eyeType, settings) {
        super({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        this.extensionPath = extensionPath;
        this.eyeType = eyeType;
        this.settings = settings;
        this._timeoutId = null;
        this._currentFrame = 0;

        // Create frame with rounded corners
        const frame = new Gtk.Frame();
        frame.add_css_class('card');

        // Preview image
        this.previewImage = new Gtk.Image({
            pixel_size: OVERLAY_MAX_SIZE,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });

        const frameBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            spacing: 0,
            width_request: OVERLAY_MAX_SIZE + 20,
            height_request: OVERLAY_MAX_SIZE + 20,
        });
        frameBox.append(this.previewImage);
        frame.set_child(frameBox);
        this.append(frame);

        // Info label
        this.infoLabel = new Gtk.Label({
            label: _('Loading preview...'),
            wrap: true,
        });
        this.append(this.infoLabel);

        // Load GIF
        this._loadGif();
    }

    _loadGif() {
        try {
            const gifPath = `${this.extensionPath}/icons/${this.eyeType}.gif`;
            const gifFile = Gio.File.new_for_path(gifPath);
            
            if (!gifFile.query_exists(null)) {
                this.infoLabel.set_label(_('GIF file not found'));
                return;
            }

            this._gifAnimation = GdkPixbuf.PixbufAnimation.new_from_file(gifPath);
            if (!this._gifAnimation) {
                this.infoLabel.set_label(_('Failed to load GIF'));
                return;
            }

            this._gifIter = this._gifAnimation.get_iter(null);
            this._frameCount = 0;
            this._startPreview();
        } catch (error) {
            this.infoLabel.set_label(_(`Error: ${error.message}`));
        }
    }

    _startPreview() {
        if (!this._gifIter || !this._gifAnimation)
            return;

        const visibleMs = Math.max(500, Math.round(this.settings.get_double('animation-duration') * 1000));
        const delayMs = Math.max(100, Math.round(this.settings.get_double('blink-interval') * 1000));
        const fadeMs = Math.max(0, Math.round(this.settings.get_double('fade-duration') * 1000));
        const opacityPercent = Math.max(0, Math.min(100, this.settings.get_int('reminder-opacity')));
        const targetOpacity = Math.round(opacityPercent / 100 * 255);
        const actualFadeMs = Math.min(fadeMs, Math.floor(visibleMs / 2));

        this._cycleState = 'fadeIn'; // fadeIn -> hold -> fadeOut -> delay
        this._cycleStartTime = Date.now();
        this._visibleMs = visibleMs;
        this._delayMs = delayMs;
        this._fadeMs = fadeMs;
        this._targetOpacity = targetOpacity;
        this._actualFadeMs = actualFadeMs;

        this._animationStartTime = Date.now();
        this._currentOpacity = 0;

        this.infoLabel.set_label(
            _(`Duration: ${(visibleMs/1000).toFixed(1)}s | `) +
            _(`Interval: ${(delayMs/1000).toFixed(1)}s | `) +
            _(`Fade: ${(fadeMs/1000).toFixed(2)}s`)
        );

        this._renderFrame();
    }

    _renderFrame() {
        try {
            if (!this._gifIter || !this.previewImage)
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

            // Update opacity based on cycle state
            const elapsed = Date.now() - this._cycleStartTime;
            let opacity = this._targetOpacity / 255;

            if (this._cycleState === 'fadeIn') {
                if (elapsed < this._actualFadeMs) {
                    opacity = (elapsed / this._actualFadeMs) * (this._targetOpacity / 255);
                } else {
                    this._cycleState = 'hold';
                    opacity = this._targetOpacity / 255;
                }
            } else if (this._cycleState === 'hold') {
                const holdMs = Math.max(0, this._visibleMs - (this._actualFadeMs * 2));
                if (elapsed >= this._actualFadeMs + holdMs) {
                    this._cycleState = 'fadeOut';
                    this._cycleStartTime = Date.now();
                }
                opacity = this._targetOpacity / 255;
            } else if (this._cycleState === 'fadeOut') {
                if (elapsed < this._actualFadeMs) {
                    opacity = (1 - (elapsed / this._actualFadeMs)) * (this._targetOpacity / 255);
                } else {
                    this._cycleState = 'delay';
                    this._cycleStartTime = Date.now();
                    opacity = 0;
                }
            } else if (this._cycleState === 'delay') {
                if (elapsed >= this._delayMs) {
                    this._cycleStartTime = Date.now();
                    this._cycleState = 'fadeIn';
                }
                opacity = 0;
            }

            this.previewImage.set_from_pixbuf(frame);
            this.previewImage.set_opacity(opacity);

            const delay = Math.max(16, this._gifIter.get_delay_time());
            this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                if (!this._gifIter)
                    return GLib.SOURCE_REMOVE;

                this._gifIter.advance(null);
                this._renderFrame();
                return GLib.SOURCE_REMOVE;
            });
        } catch (err) {
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }
        }
    }

    cleanup() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._gifAnimation = null;
        this._gifIter = null;
    }
});

export default class BlinkPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const extensionPath = this.path;

        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const generalGroup = new Adw.PreferencesGroup({
            title: _('Indicator'),
            description: _('Configure the panel icon visibility and position.'),
        });

        const reminderPage = new Adw.PreferencesPage({
            title: _('Blink Reminder'),
            icon_name: 'alarm-symbolic',
        });

        const reminderGroup = new Adw.PreferencesGroup({
            title: _('Reminder overlay'),
            description: _('Control the on-screen blink reminder.'),
        });

        // Create preview group
        const previewGroup = new Adw.PreferencesGroup({
            title: _('Live Preview'),
            description: _('See how the reminder will look with current settings.'),
        });

        const reminderLayout = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
            hexpand: true,
            homogeneous: false,
            row_spacing: 18,
            column_spacing: 18,
        });

        const reminderLayoutRow = new Adw.ActionRow({
            title: '',
            subtitle: '',
        });
        reminderLayoutRow.add_suffix(reminderLayout);
        reminderLayoutRow.activatable_widget = reminderLayout;

        const reminderLayoutGroup = new Adw.PreferencesGroup({
            title: _('Blink Reminder layout'),
            description: _('Preview and reminder controls are shown side by side when space allows.'),
        });
        reminderLayoutGroup.add(reminderLayoutRow);

        let previewBox = null;

        const reminderEnabledRow = new Adw.SwitchRow({
            title: _('Enable blink reminder'),
            subtitle: _('Show the reminder overlay on the screen.'),
        });
        settings.bind('reminder-enabled', reminderEnabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const opacityRow = new Adw.ActionRow({
            title: _('Reminder opacity'),
            subtitle: _('Adjust how transparent the blink reminder appears.'),
        });

        const opacityAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 1,
            page_increment: 5,
            value: settings.get_int('reminder-opacity'),
        });

        const opacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: opacityAdjustment,
            hexpand: true,
            draw_value: false,
        });
        opacityRow.add_suffix(opacityScale);
        opacityRow.activatable_widget = opacityScale;

        const opacityValueLabel = new Gtk.Label({
            label: `${settings.get_int('reminder-opacity')}%`,
            xalign: 1,
        });
        opacityRow.add_suffix(opacityValueLabel);

        const blinkIntervalRow = new Adw.ActionRow({
            title: _('Blink interval'),
            subtitle: _('How long to wait before the reminder shows again.'),
        });

        const blinkIntervalAdjustment = new Gtk.Adjustment({
            lower: 0.5,
            upper: 60.0,
            step_increment: 0.5,
            page_increment: 1.0,
            value: settings.get_double('blink-interval'),
        });

        const blinkIntervalScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: blinkIntervalAdjustment,
            hexpand: true,
            draw_value: false,
            digits: 1,
        });
        blinkIntervalRow.add_suffix(blinkIntervalScale);
        blinkIntervalRow.activatable_widget = blinkIntervalScale;

        const blinkIntervalValueLabel = new Gtk.Label({
            label: `${settings.get_double('blink-interval').toFixed(1)}s`,
            xalign: 1,
        });
        blinkIntervalRow.add_suffix(blinkIntervalValueLabel);

        const animationDurationRow = new Adw.ActionRow({
            title: _('Animation duration'),
            subtitle: _('How long the reminder stays visible.'),
        });

        const animationDurationAdjustment = new Gtk.Adjustment({
            lower: 0.5,
            upper: 30.0,
            step_increment: 0.5,
            page_increment: 1.0,
            value: settings.get_double('animation-duration'),
        });

        const animationDurationScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: animationDurationAdjustment,
            hexpand: true,
            draw_value: false,
            digits: 1,
        });
        animationDurationRow.add_suffix(animationDurationScale);
        animationDurationRow.activatable_widget = animationDurationScale;

        const animationDurationValueLabel = new Gtk.Label({
            label: `${settings.get_double('animation-duration').toFixed(1)}s`,
            xalign: 1,
        });
        animationDurationRow.add_suffix(animationDurationValueLabel);

        const fadeDurationRow = new Adw.ActionRow({
            title: _('Fade duration'),
            subtitle: _('How long the reminder takes to fade in and out.'),
        });

        const fadeDurationAdjustment = new Gtk.Adjustment({
            lower: 0.0,
            upper: 2.0,
            step_increment: 0.05,
            page_increment: 0.1,
            value: settings.get_double('fade-duration'),
        });

        const fadeDurationScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: fadeDurationAdjustment,
            hexpand: true,
            draw_value: false,
            digits: 2,
        });
        fadeDurationRow.add_suffix(fadeDurationScale);
        fadeDurationRow.activatable_widget = fadeDurationScale;

        const fadeDurationValueLabel = new Gtk.Label({
            label: `${settings.get_double('fade-duration').toFixed(2)}s`,
            xalign: 1,
        });
        fadeDurationRow.add_suffix(fadeDurationValueLabel);

        const eyeTypeRow = new Adw.ComboRow({
            title: _('Eye animation'),
            subtitle: _('Choose which eye animation to display.'),
        });

        const eyeTypeModel = new Gtk.StringList();
        eyeTypeModel.append('Eye 1');
        eyeTypeModel.append('Eye 2');
        eyeTypeRow.model = eyeTypeModel;

        const eyeTypeToIndex = {
            'eye_1': 0,
            'eye_2': 1,
        };

        const indexToEyeType = ['eye_1', 'eye_2'];

        const syncEyeTypeFromSettings = () => {
            const value = settings.get_string('eye-type');
            const index = eyeTypeToIndex[value] ?? eyeTypeToIndex['eye_1'];
            if (eyeTypeRow.selected !== index)
                eyeTypeRow.selected = index;
        };

        syncEyeTypeFromSettings();

        const settingsEyeTypeChangedId = settings.connect('changed::eye-type', () => {
            syncEyeTypeFromSettings();
            // Eye type changed, update preview
            if (previewBox) {
                previewBox.cleanup();
                previewGroup.remove(previewBox);
            }
            const eyeType = settings.get_string('eye-type');
            previewBox = new BlinkPreviewBox(extensionPath, eyeType, settings);
            previewGroup.add(previewBox);
        });

        const eyeTypeRowNotifyId = eyeTypeRow.connect('notify::selected', () => {
            const selected = eyeTypeRow.selected;
            const value = indexToEyeType[selected] ?? 'eye_1';

            if (settings.get_string('eye-type') !== value) {
                settings.set_string('eye-type', value);
            }
        });

        // Create initial preview with current eye type
        const initialEyeType = settings.get_string('eye-type');
        previewBox = new BlinkPreviewBox(extensionPath, initialEyeType, settings);
        previewGroup.add(previewBox);
        reminderLayout.append(previewGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset settings'),
        });

        const resetContent = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });

        resetContent.append(new Gtk.Image({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        resetContent.append(new Gtk.Label({
            label: _('Reset to Defaults'),
            valign: Gtk.Align.CENTER,
        }));

        const resetButton = new Gtk.Button({
            child: resetContent,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            height_request: 32,
        });
        resetButton.add_css_class('destructive-action');
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;

        resetButton.connect('clicked', () => {
            for (const key of [
                'show-icon',
                'icon-position',
                'icon-index',
                'reminder-enabled',
                'reminder-opacity',
                'blink-interval',
                'animation-duration',
                'fade-duration',
                'eye-type',
            ]) {
                settings.reset(key);
            }
        });

        const showIconRow = new Adw.SwitchRow({
            title: _('Show system status icon'),
            subtitle: _('Enable or disable the panel indicator.'),
        });
        settings.bind('show-icon', showIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const positionRow = new Adw.ComboRow({
            title: _('Icon position'),
            subtitle: _('Choose where the icon appears in the top panel.'),
        });

        const indexRow = new Adw.ActionRow({
            title: _('Group position index'),
            subtitle: _('Negative values move further to the start, 0 is default start, positive values move forward.'),
        });

        const indexAdjustment = new Gtk.Adjustment({
            lower: -50,
            upper: 50,
            step_increment: 1,
            page_increment: 1,
            value: settings.get_int('icon-index'),
        });

        const indexSpin = new Gtk.SpinButton({
            numeric: true,
            climb_rate: 1,
            adjustment: indexAdjustment,
        });
        indexRow.add_suffix(indexSpin);

        const positionModel = new Gtk.StringList();
        positionModel.append(_('Left'));
        positionModel.append(_('Center'));
        positionModel.append(_('Right'));
        positionRow.model = positionModel;

        const positionToIndex = {
            left: 0,
            center: 1,
            right: 2,
        };

        const indexToPosition = ['left', 'center', 'right'];

        const syncPositionFromSettings = () => {
            const value = settings.get_string('icon-position');
            const index = positionToIndex[value] ?? positionToIndex.right;
            if (positionRow.selected !== index)
                positionRow.selected = index;
        };

        syncPositionFromSettings();

        const settingsChangedId = settings.connect('changed::icon-position', () => {
            syncPositionFromSettings();
        });

        const rowNotifyId = positionRow.connect('notify::selected', () => {
            const selected = positionRow.selected;
            const value = indexToPosition[selected] ?? 'right';

            if (settings.get_string('icon-position') !== value)
                settings.set_string('icon-position', value);
        });

        const settingsIndexChangedId = settings.connect('changed::icon-index', () => {
            const value = settings.get_int('icon-index');
            if (indexSpin.get_value_as_int() !== value)
                indexSpin.set_value(value);
        });

        const settingsOpacityChangedId = settings.connect('changed::reminder-opacity', () => {
            const value = settings.get_int('reminder-opacity');
            if (Math.round(opacityScale.get_value()) !== value)
                opacityScale.set_value(value);
            opacityValueLabel.set_label(`${value}%`);
            // Restart preview with new opacity
            if (previewBox) {
                previewBox.cleanup();
                previewGroup.remove(previewBox);
                const eyeType = settings.get_string('eye-type');
                previewBox = new BlinkPreviewBox(extensionPath, eyeType, settings);
                previewGroup.add(previewBox);
            }
        });

        const settingsBlinkIntervalChangedId = settings.connect('changed::blink-interval', () => {
            const value = settings.get_double('blink-interval');
            if (Math.abs(blinkIntervalScale.get_value() - value) > 0.001)
                blinkIntervalScale.set_value(value);
            blinkIntervalValueLabel.set_label(`${value.toFixed(1)}s`);
            // Restart preview with new interval
            if (previewBox) {
                previewBox.cleanup();
                previewGroup.remove(previewBox);
                const eyeType = settings.get_string('eye-type');
                previewBox = new BlinkPreviewBox(extensionPath, eyeType, settings);
                previewGroup.add(previewBox);
            }
        });

        const settingsAnimationDurationChangedId = settings.connect('changed::animation-duration', () => {
            const value = settings.get_double('animation-duration');
            if (Math.abs(animationDurationScale.get_value() - value) > 0.001)
                animationDurationScale.set_value(value);
            animationDurationValueLabel.set_label(`${value.toFixed(1)}s`);
            // Restart preview with new duration
            if (previewBox) {
                previewBox.cleanup();
                previewGroup.remove(previewBox);
                const eyeType = settings.get_string('eye-type');
                previewBox = new BlinkPreviewBox(extensionPath, eyeType, settings);
                previewGroup.add(previewBox);
            }
        });

        const settingsFadeDurationChangedId = settings.connect('changed::fade-duration', () => {
            const value = settings.get_double('fade-duration');
            if (Math.abs(fadeDurationScale.get_value() - value) > 0.001)
                fadeDurationScale.set_value(value);
            fadeDurationValueLabel.set_label(`${value.toFixed(2)}s`);
            // Restart preview with new fade duration
            if (previewBox) {
                previewBox.cleanup();
                previewGroup.remove(previewBox);
                const eyeType = settings.get_string('eye-type');
                previewBox = new BlinkPreviewBox(extensionPath, eyeType, settings);
                previewGroup.add(previewBox);
            }
        });

        const spinValueChangedId = indexSpin.connect('value-changed', () => {
            const value = indexSpin.get_value_as_int();
            if (settings.get_int('icon-index') !== value)
                settings.set_int('icon-index', value);
        });

        const opacityValueChangedId = opacityScale.connect('value-changed', () => {
            const value = Math.round(opacityScale.get_value());
            opacityValueLabel.set_label(`${value}%`);
            if (settings.get_int('reminder-opacity') !== value)
                settings.set_int('reminder-opacity', value);
        });

        const blinkIntervalValueChangedId = blinkIntervalScale.connect('value-changed', () => {
            const value = Number(blinkIntervalScale.get_value().toFixed(1));
            blinkIntervalValueLabel.set_label(`${value.toFixed(1)}s`);
            if (settings.get_double('blink-interval') !== value)
                settings.set_double('blink-interval', value);
        });

        const animationDurationValueChangedId = animationDurationScale.connect('value-changed', () => {
            const value = Number(animationDurationScale.get_value().toFixed(1));
            animationDurationValueLabel.set_label(`${value.toFixed(1)}s`);
            if (settings.get_double('animation-duration') !== value)
                settings.set_double('animation-duration', value);
        });

        const fadeDurationValueChangedId = fadeDurationScale.connect('value-changed', () => {
            const value = Number(fadeDurationScale.get_value().toFixed(2));
            fadeDurationValueLabel.set_label(`${value.toFixed(2)}s`);
            if (settings.get_double('fade-duration') !== value)
                settings.set_double('fade-duration', value);
        });

        window.connect('close-request', () => {
            // Cleanup preview
            if (previewBox) {
                previewBox.cleanup();
                previewBox = null;
            }

            // Resume real overlay
            try {
                const ext = this.get_extension();
                if (ext && ext._resumeReminderCycle) {
                    ext._resumeReminderCycle();
                }
            } catch (e) {
                // Extension might not be available
            }

            settings.disconnect(settingsChangedId);
            positionRow.disconnect(rowNotifyId);
            settings.disconnect(settingsIndexChangedId);
            settings.disconnect(settingsOpacityChangedId);
            settings.disconnect(settingsBlinkIntervalChangedId);
            settings.disconnect(settingsAnimationDurationChangedId);
            settings.disconnect(settingsFadeDurationChangedId);
            settings.disconnect(settingsEyeTypeChangedId);
            eyeTypeRow.disconnect(eyeTypeRowNotifyId);
            indexSpin.disconnect(spinValueChangedId);
            opacityScale.disconnect(opacityValueChangedId);
            blinkIntervalScale.disconnect(blinkIntervalValueChangedId);
            animationDurationScale.disconnect(animationDurationValueChangedId);
            fadeDurationScale.disconnect(fadeDurationValueChangedId);
            return false;
        });

        // Pause real overlay when window opens
        try {
            const ext = this.get_extension();
            if (ext && ext._pauseReminderCycle) {
                ext._pauseReminderCycle();
            }
        } catch (e) {
            // Extension might not be available
        }

        generalGroup.add(showIconRow);
        generalGroup.add(positionRow);
        generalGroup.add(indexRow);
        generalPage.add(generalGroup);

        reminderGroup.add(reminderEnabledRow);
        reminderGroup.add(eyeTypeRow);
        reminderGroup.add(opacityRow);
        reminderGroup.add(blinkIntervalRow);
        reminderGroup.add(animationDurationRow);
        reminderGroup.add(fadeDurationRow);
        reminderGroup.add(resetRow);
        reminderLayout.append(reminderGroup);
        reminderPage.add(reminderLayoutGroup);

        window.add(generalPage);
        window.add(reminderPage);
    }
}
