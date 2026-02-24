import { ComputePipeline, GraphicsDevice, RenderCommandBuffer, WGPUBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { EN_DATA_TEXTURE_TYPE, EN_SAMPLER_TYPE, Renderer, ResourceManager } from "../renderers";
import tonemapShader from '../../shaders/postprocess/tonemap_cs.wgsl';

const POSTPROCESS_BLOCKSIZE = 8;

export class Tonemap extends Renderer {
    private readonly _pipeline: ComputePipeline;

    private readonly _params: WGPUBuffer;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);

        this._pipeline = this._graphicsDevice.createComputePipelineByCode(tonemapShader);

        this._params = this._setupUniformBuffer([1, 1, 1, 1, 1, 0, 0, 0], 'params');
    }

    public update(dt: number) { }

    public render(cmd: RenderCommandBuffer, input: WGPUTexture, output: WGPUTexture, exposure: number, bloom?: WGPUTexture) {
        if (!this._pipeline || !input || !output) {
            return;
        }
        const { desc: { width, height } } = output;

        this._params.update(new Float32Array([width, height, 1 / width, 1 / height, exposure, 0, 0, 0]));

        this._graphicsDevice.beginEvent(cmd, "Postprocess_Tonemap");
        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, this._params, 0);
        this._graphicsDevice.bindResource(cmd, input, 1);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_CLAMP)!, 2);
        this._graphicsDevice.bindUAV(cmd, output, 3);
        this._graphicsDevice.bindResource(cmd, bloom || this._resoueces.getTexture(EN_DATA_TEXTURE_TYPE.BLACK)!, 4);
        this._graphicsDevice.dispatch(cmd,
            Math.ceil(width / POSTPROCESS_BLOCKSIZE),
            Math.ceil(height / POSTPROCESS_BLOCKSIZE),
            1);
        this._graphicsDevice.endComputePass(cmd);
        this._graphicsDevice.endEvent(cmd);
    }
}
