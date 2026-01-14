import { EN_RESOURCE_MISC_FLAG, EN_TEX_TYPE, GraphicsDevice, WGPUBuffer, WGPUTexture, ComputePipeline, RenderCommandBuffer } from "@eric-schecter/graphics";
import { Renderer } from "./renderer";
import { GENERATEMIPCHAIN_2D_BLOCK_SIZE } from "./constant";

export class MipmapGenerator extends Renderer {
    private _pipeline: ComputePipeline;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);
        this._createPipelines();
    }

    public run(cmd: RenderCommandBuffer, texture: WGPUTexture) {
        const { desc: { type, arraySize, width, height, mipLevels, miscFlags } } = texture;
        let w = width;
        let h = height;
        if (type === EN_TEX_TYPE.TEXTURE_2D) {
            if (miscFlags === EN_RESOURCE_MISC_FLAG.TEXTURECUBE) {
                if (arraySize > 6) {
                    // cube array
                    throw new Error('not supported');
                } else {
                    if (!this._pipeline) {
                        throw new Error('no pipeline');
                    }

                    const mipmapBuffers: WGPUBuffer[] = [];
                    for (let i = 0; i < mipLevels - 1; i++) {
                        mipmapBuffers.push(this._setupUniformBuffer([width, height, 1 / width, 1 / height], 'mipmap output'));
                    }

                    this._graphicsDevice.beginEvent(cmd, 'generate mipmap cube - linear');
                    this._graphicsDevice.beginComputePass(cmd);
                    this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
                    for (let i = 0; i < mipLevels - 1; i++) {
                        w = Math.max(1, w / 2);
                        h = Math.max(1, h / 2);

                        mipmapBuffers[i].update(new Float32Array([w, h, 1 / w, 1 / h]));

                        this._graphicsDevice.bindResource(cmd, mipmapBuffers[i], 0);
                        this._graphicsDevice.bindResource(cmd, texture, 1, i);
                        this._graphicsDevice.bindSampler(cmd, this._sampler, 2);
                        this._graphicsDevice.bindUAV(cmd, texture, 3, i + 1);
                        this._graphicsDevice.dispatch(cmd,
                            Math.max(1, Math.floor((w + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE)),
                            Math.max(1, Math.floor((h + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE)),
                            6);
                    }
                    this._graphicsDevice.endComputePass(cmd);
                    this._graphicsDevice.endEvent(cmd);
                }
            } else {
                throw new Error('not supported');
                // const mipmapBuffers: WGPUBuffer[] = [];
                // for (let i = 0; i < mipLevels - 1; i++) {
                //     mipmapBuffers.push(this._setupUniformBuffer([width, height, 1, 0, 1 / width, 1 / height, 1], 'mipmap output'));
                // }

                // this._graphicsDevice.beginEvent(cmd, 'generate mipmap 2d - linear');
                // this._graphicsDevice.bindComputePipeline(cmd, this._pipeline);
                // for (let i = 0; i < mipLevels - 1; i++) {
                //     w = Math.max(1, width / 2);
                //     h = Math.max(1, height / 2);

                //     mipmapBuffers[i].update(new Float32Array([w, h, 1, 0, 1 / w, 1 / h, 1]));

                //     this._graphicsDevice.bindResource(cmd, mipmapBuffers[i], 0);
                //     this._graphicsDevice.bindResource(cmd, texture, 1, i);
                //     this._graphicsDevice.bindSampler(cmd, this._sampler, 2);
                //     this._graphicsDevice.bindResource(cmd, texture, 3, i + 1);
                //     this._graphicsDevice.dispatch(cmd,
                //         Math.max(1, (w + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE),
                //         Math.max(1, (h + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE),
                //         1)
                // }
                // this._graphicsDevice.endEvent(cmd);
            }
        } else if (type === EN_TEX_TYPE.TEXTURE_3D) {
            throw new Error('not supported');
        } else {
            throw new Error('not supported');
        }
    }

    private async _createPipelines() {
        this._pipeline = await this._graphicsDevice.createComputePipeline('shaders/mipmap/generate_mipchain_cube_float4_cs.wgsl');
    }
}
