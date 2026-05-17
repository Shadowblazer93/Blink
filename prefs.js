import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
            width_request: 200,
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
            width_request: 200,
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
            width_request: 200,
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
            width_request: 200,
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
        });

        const eyeTypeRowNotifyId = eyeTypeRow.connect('notify::selected', () => {
            const selected = eyeTypeRow.selected;
            const value = indexToEyeType[selected] ?? 'eye_1';

            if (settings.get_string('eye-type') !== value) {
                settings.set_string('eye-type', value);
            }
        });



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
        });

        const settingsBlinkIntervalChangedId = settings.connect('changed::blink-interval', () => {
            const value = settings.get_double('blink-interval');
            if (Math.abs(blinkIntervalScale.get_value() - value) > 0.001)
                blinkIntervalScale.set_value(value);
            blinkIntervalValueLabel.set_label(`${value.toFixed(1)}s`);
        });

        const settingsAnimationDurationChangedId = settings.connect('changed::animation-duration', () => {
            const value = settings.get_double('animation-duration');
            if (Math.abs(animationDurationScale.get_value() - value) > 0.001)
                animationDurationScale.set_value(value);
            animationDurationValueLabel.set_label(`${value.toFixed(1)}s`);
        });

        const settingsFadeDurationChangedId = settings.connect('changed::fade-duration', () => {
            const value = settings.get_double('fade-duration');
            if (Math.abs(fadeDurationScale.get_value() - value) > 0.001)
                fadeDurationScale.set_value(value);
            fadeDurationValueLabel.set_label(`${value.toFixed(2)}s`);
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
        reminderPage.add(reminderGroup);

        window.add(generalPage);
        window.add(reminderPage);
    }
}
