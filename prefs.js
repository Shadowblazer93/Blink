import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BlinkPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Indicator'),
            description: _('Configure the panel icon visibility and position.'),
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

        const spinValueChangedId = indexSpin.connect('value-changed', () => {
            const value = indexSpin.get_value_as_int();
            if (settings.get_int('icon-index') !== value)
                settings.set_int('icon-index', value);
        });

        window.connect('close-request', () => {
            settings.disconnect(settingsChangedId);
            positionRow.disconnect(rowNotifyId);
            settings.disconnect(settingsIndexChangedId);
            indexSpin.disconnect(spinValueChangedId);
            return false;
        });

        group.add(showIconRow);
        group.add(positionRow);
        group.add(indexRow);
        page.add(group);
        window.add(page);
    }
}
