import argparse
import json
import subprocess
import tempfile
import os
from contextlib import nullcontext

from PIL import Image, ImageColor, ImageEnhance
from tqdm import tqdm

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

def get_frame(file_name, palette_im):
    with Image.open(file_name) as im:
        assert im.size == (w, h)

        enhancer = ImageEnhance.Contrast(im) # slightly improve how it looks
        im = enhancer.enhance(1.3)

        paletted_im = im.quantize(palette=palette_im, dither=Image.NONE)
        return [[paletted_im.getpixel((x, y)) for y in range(h)] for x in range(w)]

def encode(a):
    # Simple run length encoding
    encoded = []
    i = 0
    while i < len(a):
        j = i + 1
        while j < len(a) and a[i] == a[j]:
            j += 1
        encoded += [a[i], j - i]
        i = j
    return encoded

def run(in_, out, fps, frames_out_dir, frames_in_dir):
    if frames_in_dir:
        ctx = nullcontext(frames_in_dir)
    elif frames_out_dir:
        os.makedirs(frames_out_dir, exist_ok=True)
        ctx = nullcontext(frames_out_dir)
    else:
        ctx = tempfile.TemporaryDirectory()

    with ctx as dir_:
        if not frames_in_dir:
            args = ['ffmpeg', '-hide_banner', '-i', in_, '-filter:v', f'fps={fps},scale={scale}', f'{dir_}/%04d.bmp']
            proc = subprocess.run(args)
            proc.check_returncode()

        files = []
        while True:
            file_name = os.path.join(dir_, f'{1 + len(files):04}.bmp')
            if not os.path.exists(file_name):
                break
            files.append(file_name)

        palette_im = get_palette_im()
        frames = [get_frame(f, palette_im) for f in tqdm(files, ncols=80, desc='Processing frames')]

    assert frames

    encoded_frames = []
    for frame in tqdm(frames, ncols=80, desc='Encoding frames'):
        encoded = encode([val for col in frame for val in col])
        encoded_frames.append(encoded)

    data = {
        'fps': fps,
        'frames': encoded_frames,
    }
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('Frames written to', out)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--in', metavar='IN', dest='in_', help='input video file')
    parser.add_argument('--out', required=True, help='output frames JSON file')
    parser.add_argument('--fps', help='fps to extract frames at, defaults to 30')
    parser.add_argument('--frames_out_dir', help='output dir for the frames, a temporary dir will be created if not specified')
    parser.add_argument('--frames_in_dir', help='input dir containing frames, if specified frames generation will be skipped')
    args = parser.parse_args()

    if not (bool(args.in_) ^ bool(args.frames_in_dir)):
        raise ValueError('Exactly one of --in and --frames_in_dir must be specified')
    if not args.in_ and args.fps:
        raise ValueError('--fps can only be specified with --in')
    if not args.in_ and args.frames_out_dir:
        raise ValueError('--frames_out_dir can only be specified with --in')

    run(args.in_, args.out, args.fps or 30, args.frames_out_dir, args.frames_in_dir)

if __name__ == '__main__':
    main()
