type PixelSource = { width: number; height: number; pixels: Uint8ClampedArray };

export class TestCanvas {
  private canvasWidth = 0;
  private canvasHeight = 0;
  pixels = new Uint8ClampedArray();
  drawCalls: number[][] = [];

  get width() {
    return this.canvasWidth;
  }

  set width(value: number) {
    this.canvasWidth = value;
    this.resize();
  }

  get height() {
    return this.canvasHeight;
  }

  set height(value: number) {
    this.canvasHeight = value;
    this.resize();
  }

  private resize() {
    this.pixels = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4);
  }

  getContext() {
    return {
      filter: "none",
      drawImage: (source: PixelSource, ...args: number[]) => {
        this.drawCalls.push(args);
        const [sx, sy, sw, sh, dx, dy, dw, dh] =
          args.length === 8
            ? args
            : [0, 0, source.width, source.height, args[0] ?? 0, args[1] ?? 0, this.width, this.height];
        for (let y = 0; y < (dh ?? 0); y++) {
          for (let x = 0; x < (dw ?? 0); x++) {
            const sourceX = Math.max(
              0,
              Math.min(source.width - 1, Math.floor((sx ?? 0) + (x / (dw ?? 1)) * (sw ?? 1))),
            );
            const sourceY = Math.max(
              0,
              Math.min(source.height - 1, Math.floor((sy ?? 0) + (y / (dh ?? 1)) * (sh ?? 1))),
            );
            const sourceIndex = (sourceY * source.width + sourceX) * 4;
            const targetIndex = (((dy ?? 0) + y) * this.width + (dx ?? 0) + x) * 4;
            this.pixels.set(source.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
          }
        }
      },
      getImageData: () => ({ data: new Uint8ClampedArray(this.pixels) }),
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: (image: { data: Uint8ClampedArray }) => this.pixels.set(image.data),
      translate() {},
      rotate() {},
      scale() {},
    };
  }

  toBlob(callback: BlobCallback, type = "image/png") {
    callback(new Blob([this.pixels], { type }));
  }
}

export function solidPixels(width: number, height: number, value = 240) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  return pixels;
}

export function makeCanvas(width: number, height: number, pixels = solidPixels(width, height)) {
  const canvas = new TestCanvas();
  canvas.width = width;
  canvas.height = height;
  canvas.pixels.set(pixels);
  return canvas;
}

export function installCanvasEnvironment() {
  const previousDocument = globalThis.document;
  const previousCanvas = globalThis.HTMLCanvasElement;
  Object.assign(globalThis, {
    document: { createElement: () => new TestCanvas() },
    HTMLCanvasElement: TestCanvas,
  });
  return () => {
    Object.assign(globalThis, {
      document: previousDocument,
      HTMLCanvasElement: previousCanvas,
    });
  };
}
