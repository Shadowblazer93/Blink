#!/usr/bin/env python3
"""
Simple always-on-top transparent window that plays a GIF centered on the primary monitor.
Usage: overlay_player.py /path/to/animation.gif [size]
"""
import sys
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib

GIF_PATH = sys.argv[1] if len(sys.argv) > 1 else None
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 160

if not GIF_PATH:
    print('Usage: overlay_player.py /path/to/gif [size]')
    sys.exit(1)

class OverlayWindow(Gtk.Window):
    def __init__(self, gif_path, size):
        super().__init__(title='')
        from gi import require_version
        try:
            require_version('Gtk', '4.0')
            from gi.repository import Gtk, Gdk, GdkPixbuf, GLib
            GTK_VERSION = 4
        except Exception:
            try:
                require_version('Gtk', '3.0')
                from gi.repository import Gtk, Gdk, GdkPixbuf, GLib
                GTK_VERSION = 3
            except Exception:
                print('No suitable Gtk available')
                sys.exit(1)
        self.set_decorated(False)
        if hasattr(self, 'set_can_focus'):
            self.set_can_focus(False)
        if hasattr(self, 'set_keep_above'):
            try: self.set_keep_above(True)
            except Exception: pass
        if hasattr(self, 'set_skip_taskbar_hint'):
            try: self.set_skip_taskbar_hint(True)
            except Exception: pass
        if hasattr(self, 'set_skip_pager_hint'):
            try: self.set_skip_pager_hint(True)
            except Exception: pass
        try:
            self.set_type_hint(Gdk.WindowTypeHint.NOTIFICATION)
        except Exception:
            pass

        screen = Gdk.Screen.get_default()
        try:
            rgba = screen.get_rgba_visual()
            if rgba and hasattr(self, 'set_visual'):
                self.set_visual(rgba)
        except Exception:
            pass

        self.set_default_size(size, size)

        try:
            anim = GdkPixbuf.PixbufAnimation.new_from_file(gif_path)
            if GTK_VERSION == 4 and hasattr(Gtk.Image, 'new_from_animation'):
                image = Gtk.Image.new_from_animation(anim)
            else:
                # In some GTK versions use pixbuf for animation or fallback
                image = Gtk.Image.new_from_animation(anim)
        except Exception:
            # fallback to static image
            pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(gif_path, size, size, True)
            image = Gtk.Image.new_from_pixbuf(pix)

        self.add(image)
        self.show_all()
        GLib.idle_add(self.center_on_primary)

    def center_on_primary(self):
        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor()
        if not monitor:
            monitor = display.get_monitor(0)
        geom = monitor.get_geometry()
        try:
            screen = Gdk.Screen.get_default()
            primary = screen.get_primary_monitor()
            geom = screen.get_monitor_geometry(primary)
        except Exception:
            geom = screen.get_monitor_geometry(0)
        w, h = self.get_size()
        x = geom.x + (geom.width - w) // 2
        y = geom.y + (geom.height - h) // 2
        self.move(x, y)

if __name__ == '__main__':
    win = OverlayWindow(GIF_PATH, SIZE)
    Gtk.main()
