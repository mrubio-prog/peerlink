"""The web UI: one page, served by peerlinkd at /. Its script talks to the daemon's /api, as the plugin does.

The page is built from the files in ui/ beside this one, once, when the daemon starts: ui/index.html is the frame,
every .css file goes into its <style> (base.css first) and every .js file into a <script> of its own (shell.js first,
then the pages in tab order). No build step and nothing fetched from elsewhere: the daemon serves the result as-is.
This file and everything in ui/ are part of the daemon's fingerprint (UI_FILES)."""
import os

UI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
# The shell first, then the pages in the order of their tabs; any other file after them, by name.
ORDER = ("base", "shell", "inbox", "agents", "tasks", "messages", "schedules", "setup")


def _rank(name):
    stem = name.rsplit(".", 1)[0]
    return (ORDER.index(stem) if stem in ORDER else len(ORDER), name)


def ui_files():
    """The files the page is built from, in the order they go in: the frame, the styles, the scripts."""
    names = os.listdir(UI_DIR)
    return (["index.html"] + sorted((n for n in names if n.endswith(".css")), key=_rank)
            + sorted((n for n in names if n.endswith(".js")), key=_rank))


def _read(name):
    with open(os.path.join(UI_DIR, name), encoding="utf-8") as f:
        return f.read()


def build():
    files = ui_files()
    frame = _read(files[0])
    styles = "".join(f"/* ui/{n} */\n{_read(n)}" for n in files if n.endswith(".css"))
    scripts = []
    for n in (n for n in files if n.endswith(".js")):
        text = _read(n)
        # Each file is a <script> of its own, so one page's error can't stop the others; it must not end the tag early.
        if "</script" in text.lower():
            raise ValueError(f"ui/{n} contains </script")
        scripts.append(f"<script>\n/* ui/{n} */\n{text}</script>\n")
    assert "<!--STYLE-->" in frame and "<!--SCRIPTS-->" in frame, "ui/index.html lost its <!--STYLE--> or <!--SCRIPTS--> marker"
    return frame.replace("<!--STYLE-->", f"<style>\n{styles}</style>", 1).replace("<!--SCRIPTS-->", "".join(scripts), 1)


UI_FILES = ui_files()
UI_HTML = build()
