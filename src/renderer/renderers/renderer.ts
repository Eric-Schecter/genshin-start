import {
    EN_BIND_FLAG, EN_COMPARISION_FUNC, EN_FILTER, EN_FORMAT, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_SAMPLER_BORDER_COLOR, EN_TEX_TYPE, EN_TEXTURE_ADDRESS_MODE,
    EN_USAGE, getFormatStride, GPUBufferDesc, GraphicsDevice, RenderCommandBuffer, Sampler, TextureDesc, WGPUTexture
} from "@eric-schecter/graphics";

export enum EN_SAMPLER_TYPE {
    LINEAR_WRAP,
    LINEAR_CLAMP,
    LINEAR_MIRROR,
    POINT_WRAP,
    POINT_CLAMP,
    POINT_MIRROR,
    ANISO_WRAP,
    ANISO_CLAMP,
    ANISO_MIRROR,
    DEPTH_COMPARE,
}

export enum EN_DATA_TEXTURE_TYPE {
    WHITE,
    BLACK,
    WHITE_CUBE,
    METAL_ROUGHNESS,
    DEPTH,
}

export abstract class Renderer {
    protected _samplers: Map<EN_SAMPLER_TYPE, Sampler> = new Map();
    protected _dataTextures: Map<EN_DATA_TEXTURE_TYPE, WGPUTexture> = new Map();

    public constructor(protected _graphicsDevice: GraphicsDevice) {
        this._createSamplers();
        this._createDummyTextures();
    }

    public abstract update(dt: number): void;
    public abstract render(cmd: RenderCommandBuffer, ...args: any): void;

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

    private _createSamplers() {
        this._samplers.set(EN_SAMPLER_TYPE.LINEAR_WRAP, this._graphicsDevice.createSampler({
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
        }));

        this._samplers.set(EN_SAMPLER_TYPE.LINEAR_CLAMP, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressV: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressW: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.LINEAR_MIRROR, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressV: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressW: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.POINT_WRAP, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_POINT,
            addressU: EN_TEXTURE_ADDRESS_MODE.WRAP,
            addressV: EN_TEXTURE_ADDRESS_MODE.WRAP,
            addressW: EN_TEXTURE_ADDRESS_MODE.WRAP,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.POINT_CLAMP, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_POINT,
            addressU: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressV: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressW: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.POINT_MIRROR, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_POINT,
            addressU: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressV: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressW: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.ANISO_WRAP, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.WRAP,
            addressV: EN_TEXTURE_ADDRESS_MODE.WRAP,
            addressW: EN_TEXTURE_ADDRESS_MODE.WRAP,
            // mipLodBias: 0,
            maxAnisotropy: 16,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.ANISO_CLAMP, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressV: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressW: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            // mipLodBias: 0,
            maxAnisotropy: 16,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.ANISO_MIRROR, this._graphicsDevice.createSampler({
            filter: EN_FILTER.MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressV: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            addressW: EN_TEXTURE_ADDRESS_MODE.MIRROR,
            // mipLodBias: 0,
            maxAnisotropy: 16,
            comparisonFunc: EN_COMPARISION_FUNC.NEVER,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 1000.0,
        }));

        this._samplers.set(EN_SAMPLER_TYPE.DEPTH_COMPARE, this._graphicsDevice.createSampler({
            filter: EN_FILTER.COMPARISON_MIN_MAG_MIP_LINEAR,
            addressU: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressV: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            addressW: EN_TEXTURE_ADDRESS_MODE.CLAMP,
            // mipLodBias: 0,
            maxAnisotropy: 0,
            comparisonFunc: EN_COMPARISION_FUNC.LESS,
            borderColor: EN_SAMPLER_BORDER_COLOR.OPAQUE_BLACK,
            minLod: 0,
            maxLod: 0,
        }));
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

        let stride = getFormatStride(desc.format);

        const descBlack = { ...desc };
        descBlack.name = 'black';

        this._dataTextures.set(EN_DATA_TEXTURE_TYPE.BLACK, this._graphicsDevice.createTexture(descBlack, [{
            dataPtr: new Uint8Array([0, 0, 0, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]));

        const descMetalRoughness = { ...desc };
        descBlack.name = 'metal roughness';

        this._dataTextures.set(EN_DATA_TEXTURE_TYPE.METAL_ROUGHNESS, this._graphicsDevice.createTexture(descMetalRoughness, [{
            dataPtr: new Uint8Array([0, 255, 0, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]));

        const descWhite = { ...desc };
        descWhite.name = 'white';

        this._dataTextures.set(EN_DATA_TEXTURE_TYPE.WHITE, this._graphicsDevice.createTexture(descWhite, [{
            dataPtr: new Uint8Array([255, 255, 255, 255]),
            rowRitch: stride,
            slicePitch: stride
        }]));

        const descWhiteCube = { ...desc };

        descWhiteCube.miscFlags = EN_RESOURCE_MISC_FLAG.TEXTURECUBE;
        descWhiteCube.arraySize = 6;
        descWhiteCube.name = 'white cube';
        this._dataTextures.set(EN_DATA_TEXTURE_TYPE.WHITE_CUBE, this._graphicsDevice.createTexture(descWhiteCube, [{
            dataPtr: new Uint8Array(new Array(24).fill(255)),
            rowRitch: stride,
            slicePitch: stride
        }]));

        const descDepth = { ...desc };
        descDepth.name = 'depth';
        descDepth.format = EN_FORMAT.D16_UNORM;

        stride = getFormatStride(desc.format);

        this._dataTextures.set(EN_DATA_TEXTURE_TYPE.DEPTH, this._graphicsDevice.createTexture(descDepth, [{
            dataPtr: new Float32Array([1]),
            rowRitch: stride,
            slicePitch: stride
        }]));
    }
}
