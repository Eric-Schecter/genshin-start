import { BlendState, DepthStencilState, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE, EN_COMPARISION_FUNC, EN_CULL_MODE,
    EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_PRIMITIVE_TOPOLOGY, EN_STENCIL_OP, GraphicsDevice, GraphicsPipeline,
    RasterizerState, RenderCommandBuffer, WGPUTexture } from "@eric-schecter/graphics";
import { Renderer } from "./renderer";

export class ImageRenderer extends Renderer {
    private _pipeline: GraphicsPipeline;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._setupPipeline();
    }

    // todo: add render area
    public render(cmd: RenderCommandBuffer, texture: WGPUTexture) {
        if (!this._pipeline || !texture) {
            return;
        }
        this._graphicsDevice.bindPipeline(cmd, this._pipeline);
        this._graphicsDevice.bindResource(cmd, texture, 0);
        this._graphicsDevice.bindSampler(cmd, this._sampler, 1);
        this._graphicsDevice.draw(cmd, 3);
    }

    private async _setupPipeline() {
        const [vs, ps] = await Promise.all([
            this._graphicsDevice.createShader('shaders/fullscreen_flipy_vs.wgsl'),
            this._graphicsDevice.createShader('shaders/image_ps.wgsl')
        ]);

        const dss: DepthStencilState = {
            depthEnable: false,
            stencilEnable: false,
            depthBoundsTestEnable: false,
            depthWriteMask: EN_DEPTH_WRITE_MASK.ALL,
            depthFunc: EN_COMPARISION_FUNC.LESS,
            stencilReadMask: 0,
            stencilWriteMask: 0xff,
            frontFace: {
                stencilFunc: EN_COMPARISION_FUNC.ALWAYS,
                stencilPassOp: EN_STENCIL_OP.REPLACE,
                stencilFailOp: EN_STENCIL_OP.KEEP,
                stencilDepthFailOp: EN_STENCIL_OP.KEEP,
            },
            backFace: {
                stencilFunc: EN_COMPARISION_FUNC.ALWAYS,
                stencilPassOp: EN_STENCIL_OP.REPLACE,
                stencilFailOp: EN_STENCIL_OP.KEEP,
                stencilDepthFailOp: EN_STENCIL_OP.KEEP,
            }
        };

        const rs: RasterizerState = {
            fillMode: EN_FILL_MODE.SOLID,
            cullMode: EN_CULL_MODE.BACK,
            depthBias: 0,
            depthBiasClamp: 0,
            slopeScaledDepthBias: 0,
            depthClipEnable: false, // not supported
            multisampleEnable: true,
            antialiasedLineEnable: false,
            conservativeRasterizationEnable: false,
            forcedSampleCount: 0,
            lineWidth: 1,
            frontCounterClockwise: true,
        };

        const bs: BlendState = {
            renderTarget: [
                {
                    srcBlend: EN_BLEND.SRC_ALPHA,
                    destBlend: EN_BLEND.INV_SRC_ALPHA,
                    blendOp: EN_BLEND_OP.ADD,
                    srcBlendAlpha: EN_BLEND.ONE,
                    destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
                    blendOpAlpha: EN_BLEND_OP.ADD,
                    blendEnable: true,
                    renderTargetWriteMask: EN_COLOR_WRITE.ENABLE_ALL
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: false,
        };

        this._pipeline = this._graphicsDevice.createPipeline({
            vs,
            ps,
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            bs,
            rs,
            dss,
            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'fullscreen',
        })
    }
}
