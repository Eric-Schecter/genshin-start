import HDRjs from 'hdr.js';

type ImageData<T> = {
    data: T,
    width: number,
    height: number,
    name: string,
}

class ImageLoader {
    private _cached = new Map<string, ImageData<Uint8Array>>();
    private _cachedHDR = new Map<string, ImageData<Float32Array>>();

    public async loadHDR(url: string): Promise<ImageData<Float32Array>> {
        if (this._cachedHDR.has(url)) {
            const data = this._cachedHDR.get(url);
            if (data === undefined) {
                console.error('get image failed');
                return { data: new Float32Array(), width: 0, height: 0, name: url };
            }
            return data;
        }

        const res = await HDRjs.load(url).then(res => res).catch(err => console.error(err));

        if (res) {
            const { width, height, rgbFloat } = res;

            const data = new Float32Array(width * height * 4);
            for (let i = 0; i < width * height; i++) {
                data[i * 4 + 0] = rgbFloat[i * 3 + 0]; // R
                data[i * 4 + 1] = rgbFloat[i * 3 + 1]; // G
                data[i * 4 + 2] = rgbFloat[i * 3 + 2]; // B
                data[i * 4 + 3] = 1.0;                // A
            }

            const dataRes = { data, width, height, name: url };
            this._cachedHDR.set(url, dataRes);
            return dataRes;
        }

        console.error('get image failed');
        return { data: new Float32Array(), width: 0, height: 0, name: url };
    }

    public async load(url: string): Promise<ImageData<Uint8Array>> {
        if (this._cached.has(url)) {
            const data = this._cached.get(url);
            if (data === undefined) {
                console.error('get image failed');
                return { data: new Uint8Array(), width: 0, height: 0, name: url };
            }
            return data;
        }

        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const { width, height } = bitmap;

        const arraybuffer = await blob.arrayBuffer();

        const res = { data: new Uint8Array(arraybuffer), width, height, name: url };
        bitmap.close();
        this._cached.set(url, res);
        return res;
    }
}

export const imageLoader = new ImageLoader();
