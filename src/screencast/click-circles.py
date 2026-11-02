#!/usr/bin/env python3
"""Screen annotations for recordings (X11): an animated circle under the pointer on
every click, and a hotkey that toggles a drawing mode where dragging draws a rectangle."""

import argparse
import math
import signal
import threading
import time

import cairo
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402
from Xlib import X, XK, display, error  # noqa: E402
from Xlib.ext import record  # noqa: E402
from Xlib.protocol import rq  # noqa: E402


def transparent_window(window):
    window.set_app_paintable(True)
    window.set_accept_focus(False)
    visual = window.get_screen().get_rgba_visual()
    if visual:
        window.set_visual(visual)


def clear(cr):
    cr.set_operator(cairo.OPERATOR_SOURCE)
    cr.set_source_rgba(0, 0, 0, 0)
    cr.paint()
    cr.set_operator(cairo.OPERATOR_OVER)


class Ripple(Gtk.Window):
    """A transparent, click-through window that plays one expanding ring."""

    def __init__(self, x, y, opts):
        super().__init__(type=Gtk.WindowType.POPUP)
        self.opts = opts
        self.size = int(opts.radius * 2 + opts.width * 2 + 4)
        self.start = time.monotonic()

        self.set_default_size(self.size, self.size)
        self.move(x - self.size // 2, y - self.size // 2)
        self.set_keep_above(True)
        transparent_window(self)

        # Empty input shape: clicks pass straight through to whatever is below.
        self.connect("realize", lambda w: w.input_shape_combine_region(cairo.Region()))
        self.connect("draw", self.on_draw)
        self.show_all()
        GLib.timeout_add(16, self.tick)

    def progress(self):
        return min((time.monotonic() - self.start) / self.opts.duration, 1.0)

    def tick(self):
        if self.progress() >= 1.0:
            self.destroy()
            return False
        self.queue_draw()
        return True

    def on_draw(self, _widget, cr):
        t = self.progress()
        eased = 1 - (1 - t) ** 3  # ease-out cubic
        alpha = 1 - t
        r, g, b = self.opts.rgb
        c = self.size / 2
        radius = self.opts.radius * (0.15 + 0.85 * eased)

        clear(cr)
        cr.arc(c, c, radius, 0, 2 * math.pi)
        cr.set_source_rgba(r, g, b, 0.25 * alpha)
        cr.fill_preserve()
        cr.set_source_rgba(r, g, b, alpha)
        cr.set_line_width(self.opts.width)
        cr.stroke()
        return False


class Overlay(Gtk.Window):
    """Full-screen transparent window for drawing mode: a drag draws a rectangle, and
    releasing the mouse clears it and closes the window."""

    def __init__(self, opts):
        super().__init__(type=Gtk.WindowType.POPUP)
        self.opts = opts
        self.start = None  # drag origin while the button is held
        self.rect = None   # (x, y, w, h) on screen
        self.closing_click = None  # X server time of the press that started the last drag

        _, _, w, h = Gdk.get_default_root_window().get_geometry()
        self.move(0, 0)
        self.set_default_size(w, h)
        transparent_window(self)

        self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK
                        | Gdk.EventMask.BUTTON_RELEASE_MASK
                        | Gdk.EventMask.BUTTON1_MOTION_MASK)
        self.connect("realize", lambda w: w.get_window().set_cursor(
            Gdk.Cursor.new_from_name(w.get_display(), "crosshair")))
        self.connect("button-press-event", self.on_press)
        self.connect("motion-notify-event", self.on_motion)
        self.connect("button-release-event", self.on_release)
        self.connect("draw", self.on_draw)

    def toggle(self):
        if self.get_visible():
            self.start = self.rect = None
            self.hide()
        else:
            self.show_all()
        return False

    def on_press(self, _widget, event):
        if event.button == 1:
            # Remembered so a late ripple for this press is skipped once we've closed.
            self.closing_click = event.time
            self.start = (event.x, event.y)
            self.rect = None
            self.queue_draw()

    def on_motion(self, _widget, event):
        if self.start:
            x0, y0 = self.start
            self.rect = (min(x0, event.x), min(y0, event.y), abs(event.x - x0), abs(event.y - y0))
            self.queue_draw()

    def on_release(self, _widget, event):
        if event.button == 1:
            self.start = None
            if self.rect:  # finishing a rectangle clears it and leaves drawing mode
                self.toggle()

    def on_draw(self, _widget, cr):
        clear(cr)
        if self.rect:
            cr.rectangle(*self.rect)
            cr.set_source_rgba(*self.opts.rgb, 1)
            cr.set_line_width(self.opts.width)
            cr.stroke()
        return False


def listen_clicks(buttons, on_click):
    """Watch global button presses via the X RECORD extension (blocks forever)."""
    dpy = display.Display()
    if not dpy.has_extension("RECORD"):
        raise SystemExit("X server has no RECORD extension")
    ctx = dpy.record_create_context(
        0,
        [record.AllClients],
        [{
            "core_requests": (0, 0), "core_replies": (0, 0),
            "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0),
            "delivered_events": (0, 0),
            "device_events": (X.ButtonPress, X.ButtonPress),
            "errors": (0, 0), "client_started": False, "client_died": False,
        }],
    )

    def handler(reply):
        if reply.category != record.FromServer or not reply.data or reply.data[0] < 2:
            return
        data = reply.data
        while data:
            event, data = rq.EventField(None).parse_binary_value(data, dpy.display, None, None)
            if event.type == X.ButtonPress and event.detail in buttons:
                GLib.idle_add(on_click, event.root_x, event.root_y, event.time)

    dpy.record_enable_context(ctx, handler)


def grab_key(name):
    """Grab a key globally, so it reaches us and not the focused app."""
    dpy = display.Display()
    keycode = dpy.keysym_to_keycode(XK.string_to_keysym(name))
    if not keycode:
        raise SystemExit(f"unknown key: {name}")
    catch = error.CatchError(error.BadAccess)
    # Also grab with Caps Lock / Num Lock on, which X counts as modifiers.
    for mods in (0, X.LockMask, X.Mod2Mask, X.LockMask | X.Mod2Mask):
        dpy.screen().root.grab_key(keycode, mods, True, X.GrabModeAsync, X.GrabModeAsync,
                                   onerror=catch)
    dpy.sync()
    if catch.get_error():
        raise SystemExit(f"{name} is already grabbed by another program")
    return dpy


def listen_key(dpy, on_press):
    while True:
        if dpy.next_event().type == X.KeyPress:
            GLib.idle_add(on_press)


def main():
    p = argparse.ArgumentParser(
        description="Show an animated circle under the pointer on every mouse click. "
                    "The draw key toggles drawing mode: drag to draw a rectangle.")
    p.add_argument("-c", "--color", default="#ff4081", help="circle and rectangle color (default: %(default)s)")
    p.add_argument("-r", "--radius", type=float, default=40, help="max circle radius in px (default: %(default)s)")
    p.add_argument("-w", "--width", type=float, default=4, help="line width in px (default: %(default)s)")
    p.add_argument("-d", "--duration", type=float, default=0.5, help="circle animation in seconds (default: %(default)s)")
    p.add_argument("-b", "--buttons", default="1,2,3",
                   help="mouse buttons to react to: 1=left 2=middle 3=right (default: %(default)s)")
    p.add_argument("-k", "--key", default="F9", help="key that toggles drawing mode (default: %(default)s)")
    opts = p.parse_args()

    rgba = Gdk.RGBA()
    if not rgba.parse(opts.color):
        p.error(f"invalid color: {opts.color}")
    opts.rgb = (rgba.red, rgba.green, rgba.blue)
    buttons = {int(b) for b in opts.buttons.split(",") if b.strip()}

    # X reports physical pixels; GTK positions windows in logical (scaled) pixels.
    scale = Gdk.Display.get_default().get_monitor(0).get_scale_factor()
    overlay = Overlay(opts)

    def on_click(x, y, when):
        # This thread may hear the click after the overlay already closed on it.
        if not overlay.get_visible() and when != overlay.closing_click:
            Ripple(round(x / scale), round(y / scale), opts)
        return False

    key_dpy = grab_key(opts.key)
    threading.Thread(target=listen_clicks, args=(buttons, on_click), daemon=True).start()
    threading.Thread(target=listen_key, args=(key_dpy, overlay.toggle), daemon=True).start()
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    print(f"click-circles running — {opts.key} toggles drawing mode, Ctrl+C stops", flush=True)
    Gtk.main()


if __name__ == "__main__":
    main()
