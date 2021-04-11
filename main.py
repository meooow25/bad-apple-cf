import argparse
import json
import subprocess
import tempfile
import os
from contextlib import nullcontext

from PIL import Image, ImageColor, ImageEnhance

# 52 weeks; 39 rows gives same aspect ratio as 480:360
scale = '52:39'
w, h = 52, 39

def get_palette_im():
    # The palette used on CF
    palette = [
        '#EBEDF0',
        '#91DA9E',
        '#40C463',
        '#30A14E',
        '#216E39',
    ]

    def colorToGray(c):
        c = ImageColor.getrgb(c)
        im = Image.new('RGB', (1, 1), c)
        im = im.convert('L')
        return [im.getpixel((0, 0))] * 3

    palette = [colorToGray(color) for color in palette]

    palette_flat = [v for color in palette for v in color]
    palette_flat += palette_flat[-3:] * (256 - len(palette))
    palette_im = Image.new('P', (1, 1))
    palette_im.putpalette(palette_flat)
    return palette_im

def get_frame(dir_, frame_num, palette_im):
    name = f'{dir_}/{frame_num:04}.bmp'
    with Image.open(name) as im:
        assert im.size == (w, h)

        enhancer = ImageEnhance.Contrast(im) # slightly improve how it looks
        im = enhancer.enhance(1.3)

        paletted_im = im.quantize(palette=palette_im, dither=Image.NONE)
        return [[paletted_im.getpixel((x, y)) for y in range(h)] for x in range(w)]

def run(in_, out, fps, tempdir):
    if tempdir:
        os.makedirs(tempdir, exist_ok=True)
        ctx = nullcontext(tempdir)
    else:
        ctx = tempfile.TemporaryDirectory()

    with ctx as dir_:
        args = ['ffmpeg', '-hide_banner', '-i', in_, '-filter:v', f'fps={fps},scale={scale}', f'{dir_}/%04d.bmp']
        proc = subprocess.run(args)
        proc.check_returncode()

        palette_im = get_palette_im()
        frames = []
        while True:
            try:
                cur_frame = len(frames) + 1
                frame = get_frame(dir_, cur_frame, palette_im)
            except FileNotFoundError:
                break
            frames.append(frame)
    assert frames

    frame_diffs = []
    last = [[None] * h for _ in range(w)]
    for frame in frames:
        diffs = []
        for x in range(w):
            for y in range(h):
                if frame[x][y] != last[x][y]:
                    diffs.append((x, y, frame[x][y]))
        frame_diffs.append(diffs)
        last = frame

    data = {
        'fps': fps,
        'frames': frame_diffs
    }
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--in', required=True, metavar='IN', dest='in_')
    parser.add_argument('--out', required=True)
    parser.add_argument('--fps', default=30)
    parser.add_argument('--tempdir')
    args = parser.parse_args()
    run(args.in_, args.out, args.fps, args.tempdir)
    print('Frames written to', args.out)

if __name__ == '__main__':
    main()
