# Release build: copies only what the game needs into dist/ and checks it.
#
#   py build.py        (or: python3 build.py)
#
# What goes in: index.html, the scripts it loads (in its <script> tags),
# the sound files from sounds/ (the game fetches them at runtime) and
# CREDITS.md (where the sound files came from, and their license).
# Nothing else: no other *.md, .claude/, .git or this script.
# The JavaScript is copied as it is (not minified), so it stays readable
# for review.
#
# In the copy of config.js DEBUG is set to false, whatever the source
# says. The build stops with an error if:
#   - GENERATED_MODE is on (a test mode that changes the levels),
#   - a file name has anything but letters, digits, _ - and .,
#   - a file is over 512 KiB,
#   - a path is not relative, or anything points outside the folder
#     (the only allowed outside address is the YouTube Playables SDK),
#   - the page <title> isn't GAME_TITLE: GAME_SUBTITLE from config.js,
#   - CREDITS.md is missing.
# At the end it prints the total size, the number of files and what
# loads before gameReady (index.html and the scripts; the sound files
# only load after the first tap).
#
# Uses only the Python standard library.

import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
SOUNDS = "sounds"
SOUND_TYPES = (".wav", ".mp3", ".ogg", ".m4a")
CREDITS = "CREDITS.md"
MAX_FILE = 512 * 1024
NAME_OK = re.compile(r"^[A-Za-z0-9_.-]+$")
SDK_URL = "https://www.youtube.com/game_api/v1"

problems = []


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def kib(size):
    return f"{size / 1024:.1f} KiB"


def copy_files():
    """Copy index.html, its scripts, the sounds and the credits into a
    clean dist/. Returns the scripts (in load order)."""
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(os.path.join(DIST, SOUNDS))

    html = read(os.path.join(ROOT, "index.html"))
    shutil.copy2(os.path.join(ROOT, "index.html"), DIST)

    scripts = []
    for src in re.findall(r'<script[^>]*\bsrc="([^"]+)"', html):
        if src == SDK_URL:
            continue
        if re.match(r"^([a-z]+:|/)", src, re.I):
            problems.append(f"index.html: script path not relative: {src}")
            continue
        scripts.append(src)
        os.makedirs(os.path.dirname(os.path.join(DIST, src)) or DIST, exist_ok=True)
        shutil.copy2(os.path.join(ROOT, src), os.path.join(DIST, src))

    for name in sorted(os.listdir(os.path.join(ROOT, SOUNDS))):
        if name.lower().endswith(SOUND_TYPES):
            shutil.copy2(os.path.join(ROOT, SOUNDS, name), os.path.join(DIST, SOUNDS, name))

    # The credits for the sound files go with the upload
    if os.path.isfile(os.path.join(ROOT, CREDITS)):
        shutil.copy2(os.path.join(ROOT, CREDITS), DIST)
    else:
        problems.append(f"{CREDITS}: missing (it lists where the sound files came from)")
    return scripts


def release_config():
    """DEBUG off in the copied config.js; GENERATED_MODE must be off."""
    path = os.path.join(DIST, "config.js")
    text = read(path)
    text, count = re.subn(r"^const DEBUG = (true|false);", "const DEBUG = false;", text, flags=re.M)
    if count != 1:
        problems.append("config.js: no single 'const DEBUG = ...;' line found")
    if not re.search(r"^const GENERATED_MODE = false;", text, re.M):
        problems.append("config.js: GENERATED_MODE must be false for a release")
    write(path, text)
    return text


def check_title(config):
    """The page title must be GAME_TITLE: GAME_SUBTITLE (config.js)."""
    title = re.search(r'^const GAME_TITLE = "([^"]*)";', config, re.M)
    subtitle = re.search(r'^const GAME_SUBTITLE = "([^"]*)";', config, re.M)
    page = re.search(r"<title>([^<]*)</title>", read(os.path.join(DIST, "index.html")))
    if not (title and subtitle and page):
        problems.append("title: GAME_TITLE, GAME_SUBTITLE or <title> not found")
        return
    wanted = f"{title.group(1)}: {subtitle.group(1)}"
    if page.group(1) != wanted:
        problems.append(f'index.html: <title> is "{page.group(1)}", config.js says "{wanted}"')


def check_files(sound_files):
    """Names, sizes, and nothing pointing outside the folder."""
    files = []
    for folder, _, names in os.walk(DIST):
        for name in names:
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, DIST).replace(os.sep, "/")
            files.append((rel, os.path.getsize(path)))
            for part in rel.split("/"):
                if not NAME_OK.match(part):
                    problems.append(f"{rel}: name may only use letters, digits, _ - and .")
            if os.path.getsize(path) > MAX_FILE:
                problems.append(f"{rel}: {kib(os.path.getsize(path))}, over 512 KiB")
            if rel.endswith((".js", ".html")):
                text = read(path)
                for url in re.findall(r"""(?:https?:)?//[A-Za-z0-9.-]+\.[a-z]{2,}[^\s"'`)<]*""", text):
                    if url != SDK_URL:
                        problems.append(f"{rel}: outside address {url}")
                if ".." + "/" in text:
                    problems.append(f"{rel}: a path going up out of the folder (../)")
    # Every sound file config.js asks for must be in the build
    for name in sound_files:
        if not os.path.isfile(os.path.join(DIST, SOUNDS, name)):
            problems.append(f"sounds/{name}: used in config.js but missing")
    return sorted(files)


def main():
    scripts = copy_files()
    config = release_config()
    check_title(config)
    sound_files = set(re.findall(r'"([A-Za-z0-9_.-]+\.(?:wav|mp3|ogg|m4a))"', config))
    files = check_files(sound_files)

    total = sum(size for _, size in files)
    first = ["index.html"] + scripts
    first_size = sum(size for rel, size in files if rel in first)
    print(f"dist/: {len(files)} files, {kib(total)}")
    for rel, size in files:
        print(f"  {rel:32} {kib(size):>10}")
    print(f"Loads before gameReady: {kib(first_size)} (index.html and {len(scripts)} scripts,")
    print("  plus the YouTube SDK; the sound files load in the background after the first tap)")

    if problems:
        print("\nBUILD FAILED:")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
