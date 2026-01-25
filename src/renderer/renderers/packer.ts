import { MaxRectsPacker, PACKING_LOGIC } from "maxrects-packer";

export class Packer {
    private _packer: MaxRectsPacker<any>;
    private _width = 0;
    private _height = 0;
    private _rects: {
        id: number,
        width: number,
        height: number,
    }[] = [];

    public add(width: number, height: number, id: number) {
        this._rects.push({
            id,
            width,
            height,
        });
        this._width = Math.max(this._width, width);
        this._height = Math.max(this._height, height);
    }

    public pack(maxWidth = 8192): boolean {
        if (this._rects.length === 0) {
            return false;
        }
        let currentWidth = this.width;
        let currentHeight = this.height;

        while (currentWidth <= maxWidth && currentHeight <= maxWidth) {

            this._build(currentWidth, currentHeight);

            if (this._done()) {
                this._width = this._packer.bins[0]?.width || currentWidth;
                this._height = this._packer.bins[0]?.height || currentHeight;
                return true;
            }

            // resize the smaller one
            if (currentHeight < currentWidth) {
                currentHeight = Math.min(currentHeight * 2, maxWidth);
            } else {
                currentWidth = Math.min(currentWidth * 2, maxWidth);
            }
        }
        // size is smaller than max width, pack failed
        this._width = 0;
        this._height = 0;
        return false;
    }

    public clear() {
        this._packer?.reset();
        this._rects = [];
        this._width = 0;
        this._height = 0;
    }

    public get rects() {
        if (!this._packer || this._packer.bins.length === 0) {
            return [];
        }
        return this._packer.bins[0].rects.map(packedRect => ({
            id: packedRect.id,
            x: packedRect.x,
            y: packedRect.y,
            w: packedRect.width,
            h: packedRect.height,
            // was_packed: true,
        }));
    }

    public get width() {
        return this._width;
    }

    public get height() {
        return this._height;
    }

    private _build(width: number, height: number): void {
        this._packer = new MaxRectsPacker(
            width,
            height,
            0, // padding
            {
                smart: true,
                pot: false,
                square: false,
                allowRotation: false,
                logic: PACKING_LOGIC.MAX_EDGE
            }
        );

        this._packer.addArray(this._rects);
    }

    private _done(): boolean {
        return this._packer.bins.length === 1 &&
            this._packer.bins[0].rects.length === this._rects.length;
    }
}
