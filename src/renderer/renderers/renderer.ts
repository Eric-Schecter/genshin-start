import {
    EN_BIND_FLAG, EN_COMPARISION_FUNC, EN_FILTER, EN_FORMAT, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_SAMPLER_BORDER_COLOR, EN_TEX_TYPE, EN_TEXTURE_ADDRESS_MODE,
    EN_USAGE, getFormatStride, GPUBufferDesc, GraphicsDevice, Sampler, SamplerDesc, TextureDesc, WGPUTexture
} from "@eric-schecter/graphics";

export abstract class Renderer {
    protected _sampler: Sampler;

    protected _blackTexture: WGPUTexture;

    protected _whiteTexture: WGPUTexture;

    protected _whiteTextureCube: WGPUTexture;

    protected _defaultMetalRoughnessTexture: WGPUTexture;

    public constructor(protected _graphicsDevice: GraphicsDevice) {
        // linear sampler
        {
            const desc: SamplerDesc = {
                filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
                addressU: EN_TEXTURE_ADDRESS_MODE.WRAP,
                addressV: EN_TEXTURE_ADDRESS_MODE.WRAP,
                addressW: EN_TEXTURE_ADDRESS_MODE.WRAP,
                // mipLodBias: 0,
                maxAnisotropy: 0,
                comparisonFunc: EN_COMPARISION_FUNC.NEVER,
                borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
                minLod: 0,
                maxLod: 1000.0,
            };

            this._sampler = this._graphicsDevice.createSampler(desc);
        }

        this._createDummyTextures();
    }

    protected _setupUniformBuffer(data: number[], name = '') {
        const color = new Float32Array(data);
        const desc: GPUBufferDesc = {
            size: color.byteLength,
            name,
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.CONSTANT_BUFFER,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: color.byteLength / Float32Array.BYTES_PER_ELEMENT,
        }
        return this._graphicsDevice.createBuffer(desc, color);
    }

    private _createDummyTextures() {
        const desc: TextureDesc = {
            type: EN_TEX_TYPE.TEXTURE_2D,
            width: 1,
            height: 1,
            depth: 1,
            arraySize: 1,
            mipLevels: 1,
            format: EN_FORMAT.R8G8B8A8_UNORM,
            sampleCount: 1,
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: {},
            layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
            name: '',
        };

        const stride = getFormatStride(desc.format);

        const descBlack = { ...desc };
        descBlack.name = 'black';

        this._blackTexture = this._graphicsDevice.createTexture(descBlack, [{
            dataPtr: new Uint8Array([0, 0, 0, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]);

        const descMetalRoughness = { ...desc };
        descBlack.name = 'metal roughness';

        this._defaultMetalRoughnessTexture = this._graphicsDevice.createTexture(descMetalRoughness, [{
            dataPtr: new Uint8Array([0, 255, 0, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]);

        const descWhite = { ...desc };
        descWhite.name = 'white';

        this._whiteTexture = this._graphicsDevice.createTexture(descWhite, [{
            dataPtr: new Uint8Array([255, 255, 255, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]);

        const descWhiteCube = { ...desc };

        descWhiteCube.miscFlags = EN_RESOURCE_MISC_FLAG.TEXTURECUBE;
        descWhiteCube.arraySize = 6;
        descWhiteCube.name = 'white cube';
        this._whiteTextureCube = this._graphicsDevice.createTexture(descWhiteCube, [{
            dataPtr: new Uint8Array(new Array(24).fill(255)),
            rowRitch: stride,
            slicePitch: stride
        }]);
    }
}
