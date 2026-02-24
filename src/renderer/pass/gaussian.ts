import { ComputePipeline, GraphicsDevice, RenderCommandBuffer, WGPUBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { EN_SAMPLER_TYPE, Renderer, ResourceManager } from "../renderers";
import blurGaussianComputeShader from '../../shaders/postprocess/blur_gaussian_float4_cs.wgsl';

const POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT = 256;

export class Gaussian extends Renderer {
    private readonly _pipeline: ComputePipeline;

    private readonly _paramsBuffer: WGPUBuffer[][] = [];

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        this._paramsBuffer.push([this._setupUniformBuffer(new Array(8).fill(0), 'params horizontal'), this._setupUniformBuffer(new Array(8).fill(0), 'params vertical')],
            [this._setupUniformBuffer(new Array(8).fill(0), 'params horizontal'), this._setupUniformBuffer(new Array(8).fill(0), 'params vertical')],
            [this._setupUniformBuffer(new Array(8).fill(0), 'params horizontal'), this._setupUniformBuffer(new Array(8).fill(0), 'params vertical')],
            [this._setupUniformBuffer(new Array(8).fill(0), 'params horizontal'), this._setupUniformBuffer(new Array(8).fill(0), 'params vertical')],
            [this._setupUniformBuffer(new Array(8).fill(0), 'params horizontal'), this._setupUniformBuffer(new Array(8).fill(0), 'params vertical')]);

        this._pipeline = this._graphicsDevice.createComputePipelineByCode(blurGaussianComputeShader);
    }

    public update(dt: number) { }

    public render(cmd: RenderCommandBuffer, input: WGPUTexture, temp: WGPUTexture, output: WGPUTexture, linearDepth: WGPUTexture, mip_src: number, mip_dst: number) {
        if (!this._pipeline || !input || !output) {
            return;
        }
        const { desc: { width, height } } = output;

        let rx = width;
        let ry = height;
        if (mip_dst > 0) {
            rx = Math.max(1, Math.floor(rx >> mip_dst));
            ry = Math.max(1, Math.floor(ry >> mip_dst));
        }

        // Horizontal:
        this._paramsBuffer[mip_src][0].update(new Float32Array([rx, ry, 1 / rx, 1 / ry, 1, 0, 0, 0]));

        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, input, 0, mip_src);
        this._graphicsDevice.bindUAV(cmd, temp, 1, mip_dst);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 2);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.POINT_CLAMP)!, 3);
        this._graphicsDevice.bindResource(cmd, linearDepth, 4);
        this._graphicsDevice.bindResource(cmd, this._paramsBuffer[mip_src][0], 5);
        this._graphicsDevice.dispatch(cmd,
            Math.ceil(rx / POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT),
            ry,
            1);
        this._graphicsDevice.endComputePass(cmd);

        // Vertical:
        this._paramsBuffer[mip_src][1].update(new Float32Array([rx, ry, 1 / rx, 1 / ry, 0, 1, 0, 0]));

        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, temp, 0, mip_dst);
        this._graphicsDevice.bindUAV(cmd, output, 1, mip_dst);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 2);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.POINT_CLAMP)!, 3);
        this._graphicsDevice.bindResource(cmd, linearDepth, 4);
        this._graphicsDevice.bindResource(cmd, this._paramsBuffer[mip_src][1], 5);
        this._graphicsDevice.dispatch(cmd,
            rx,
            Math.ceil(ry / POSTPROCESS_BLUR_GAUSSIAN_THREADCOUNT),
            1);
        this._graphicsDevice.endComputePass(cmd);
    }
}
