import { ComputePipeline, GraphicsDevice, RenderCommandBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { Renderer } from "../renderers";

const POSTPROCESS_BLOCKSIZE = 8;

export class Bloom extends Renderer {
    private _pipeline: ComputePipeline;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._graphicsDevice.createComputePipeline('shaders/postprocess/bloom_cs.wgsl').then(res => this._pipeline = res);
    }

    public render(cmd: RenderCommandBuffer, input: WGPUTexture, output: WGPUTexture) {
        if (!this._pipeline || !input || !output) {
            return;
        }
        const { desc: { width, height } } = output;

        const params = this._setupUniformBuffer([width, height, 1 / width, 1 / height], 'params');

        this._graphicsDevice.beginEvent(cmd, "Postprocess_Bloom");
        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, params, 0);
        this._graphicsDevice.bindResource(cmd, input, 1);
        this._graphicsDevice.bindSampler(cmd, this._sampler, 2);
        this._graphicsDevice.bindUAV(cmd, output, 3);
        this._graphicsDevice.dispatch(cmd,
            (width + POSTPROCESS_BLOCKSIZE - 1) / POSTPROCESS_BLOCKSIZE,
            (height + POSTPROCESS_BLOCKSIZE - 1) / POSTPROCESS_BLOCKSIZE,
            1);
        this._graphicsDevice.endComputePass(cmd);
        this._graphicsDevice.endEvent(cmd);
    }
}
