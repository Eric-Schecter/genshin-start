import { EN_BIND_FLAG, EN_FORMAT, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_TEX_TYPE, EN_USAGE, getFormatStride, GraphicsDevice, SubresourceData, TextureDesc } from "@eric-schecter/graphics";
import { scene } from "../scene";
import { query } from "bitecs";
import { TextureData } from "../components";

export class MaterialSystem {
    private _needUpdate = false;

    public update(graphicsDevice: GraphicsDevice): number {
        const { materials } = scene.components;

        for (const entity of query(scene, [materials])) {
            const materialComponent = materials[entity];
            if (!materialComponent.dirty) {
                continue;
            }
            const { diffuseTexture, normalTexture, emissiveTexture, metallicRoughnessTexture, occlusionTexture } = materialComponent;
            this._createTextureIfNeeded(graphicsDevice, diffuseTexture).then(res => {
                if (diffuseTexture.data.length === 0) {
                    console.log('no diffuse texture');
                }
                if (res) {
                    diffuseTexture.texture = res;
                    this._needUpdate = true;
                }
            })
            this._createTextureIfNeeded(graphicsDevice, normalTexture, false).then(res => {
                if (normalTexture.data.length === 0) {
                    console.log('no normal texture');
                }
                if (res) {
                    normalTexture.texture = res;
                    this._needUpdate = true;
                }
            })
            this._createTextureIfNeeded(graphicsDevice, emissiveTexture).then(res => {
                if (emissiveTexture.data.length === 0) {
                    console.log('no emissive texture');
                }
                if (res) {
                    emissiveTexture.texture = res;
                    this._needUpdate = true;
                }
            })
            this._createTextureIfNeeded(graphicsDevice, metallicRoughnessTexture, false).then(res => {
                if (metallicRoughnessTexture.data.length === 0) {
                    console.log('no metalroughness texture');
                }
                if (res) {
                    metallicRoughnessTexture.texture = res;
                    this._needUpdate = true;
                }
            })
            this._createTextureIfNeeded(graphicsDevice, occlusionTexture, false).then(res => {
                if (occlusionTexture.data.length === 0) {
                    console.log('no occlusion texture');
                }
                if (res) {
                    occlusionTexture.texture = res;
                    this._needUpdate = true;
                }
            })

            materialComponent.dirty = false;
        }

        if (this._needUpdate) {
            this._needUpdate = false;
            return 1;
        }

        return 0;
    }

    private async _createTextureIfNeeded(graphicsDevice: GraphicsDevice, textureData: TextureData, isSRGB = true) {
        if (textureData.texture || !textureData.data.length) {
            return;
        }

        const { width, height, data, name } = textureData;
        const desc: TextureDesc = {
            type: EN_TEX_TYPE.TEXTURE_2D,
            width,
            height,
            depth: 1,
            arraySize: 1,
            mipLevels: 1,
            format: isSRGB ? EN_FORMAT.R8G8B8A8_UNORM_SRGB : EN_FORMAT.R8G8B8A8_UNORM,
            sampleCount: 1,
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: {},
            layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
            name,
        };

        const buffer = data.slice();

        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const imageBitmap = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        if (!ctx) {
            throw new Error('Failed to get 2D context');
        }
        ctx.drawImage(imageBitmap, 0, 0);
        const pixelData = ctx.getImageData(0, 0, width, height).data;

        const stride = getFormatStride(desc.format);
        const subresourceData: SubresourceData = {
            dataPtr: pixelData,
            rowRitch: width * stride,
            slicePitch: width * height * stride
        };

        const res = graphicsDevice.createTexture(desc, [subresourceData]);
        imageBitmap.close();

        return res;
    }
}
