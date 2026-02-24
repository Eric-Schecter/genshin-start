import {
    BlendState, DepthStencilState, EN_BIND_FLAG, EN_BLEND, EN_BLEND_OP, EN_COLOR_WRITE,
    EN_COMPARISION_FUNC, EN_CULL_MODE, EN_DEPTH_WRITE_MASK, EN_FILL_MODE, EN_FORMAT,
    EN_LOAD_OP, RenderPassImage,
    EN_PRIMITIVE_TOPOLOGY, EN_RESOURCE_MISC_FLAG, EN_RESOURCE_STATE, EN_STENCIL_OP,
    EN_TEX_TYPE, EN_USAGE, getFormatStride, getMipCount, GraphicsDevice, GraphicsPipeline, RasterizerState,
    SubresourceData, TextureDesc, WGPUBuffer, WGPUTexture,
    ComputePipeline, RenderCommandBuffer
} from "@eric-schecter/graphics";
import { Renderer } from "./renderer";
import { mat4, vec3, vec4, glMatrix } from "gl-matrix";
import { EN_MIPGENFILTER, MipmapGenerator } from "./mipmap_generator";
import { GENERATEMIPCHAIN_2D_BLOCK_SIZE } from "./constant";
import { scene } from "../ecs";
import { query } from "bitecs";
import { imageLoader } from "../image_loader";
import { EN_SAMPLER_TYPE, ResourceManager } from "./resource_manager";
import fullScreenVertexShader from '../../shaders/fullscreen_vs.wgsl';
import skyCubemapPixelShader from '../../shaders/sky/sky_static_cubemap_ps.wgsl';
import skyStaticPixelShader from '../../shaders/sky/sky_static_ps.wgsl';
import skyStaticEnvVertexShader from '../../shaders/sky/envmap_sky_static_vs.wgsl';
import skyStaticEnvPixelShader from '../../shaders/sky/envmap_sky_static_ps.wgsl';
import filterEnvShader from '../../shaders/filter_envmap_cs.wgsl';

export class SkyRenderer extends Renderer {
    private _enable = true;

    private _envTexture: WGPUTexture;
    private _envrenderingColorTexture: WGPUTexture;
    private _envrenderingDepthTexture: WGPUTexture;
    private _envrenderingColorTextureFiltered: WGPUTexture;

    private readonly _cameraUniformBuffer: WGPUBuffer;

    private readonly _cameraUniform = new Float32Array(20);

    private _skyPipeline: GraphicsPipeline;
    private _skyCubemapPipeline: GraphicsPipeline;
    private _skyEnvPipeline: GraphicsPipeline;

    private _filterEnvMapPipeline: ComputePipeline;

    private readonly _camerasUniformBuffer: WGPUBuffer;

    private readonly _camerasUniform = new Float32Array(16 * 6);

    private readonly _paramsUniforms: WGPUBuffer[] = [];

    private _isEquirectangular = true;

    public constructor(graphicsDevice: GraphicsDevice, private readonly _resoueces: ResourceManager) {
        super(graphicsDevice);
        this._cameraUniformBuffer = this._setupUniformBuffer(Array.from(this._cameraUniform), 'camera');
        this._camerasUniformBuffer = this._setupUniformBuffer(Array.from(this._camerasUniform), 'cameras');
        for (let i = 0; i < 6; i++) {
            const uniform = new Float32Array(4);
            uniform.set(vec4.fromValues(i, 0, 0, 0));
            this._paramsUniforms.push(this._setupUniformBuffer(Array.from(uniform)));
        }
        this._setupPipeline();
        this._setupEnvCameras();
    }

    public get enable() {
        return this._enable;
    }

    public set enable(value: boolean) {
        this._enable = value;
    }

    public set envTexture(value: WGPUTexture) {
        this._envTexture = value;
    }

    public set isEquirectangular(value: boolean) {
        this._isEquirectangular = value;
    }

    public async load(url: string) {
        const res = await imageLoader.loadHDR(url);

        if (res.data.length > 0) {
            const { width, height, data: rgba } = res;

            const desc: TextureDesc = {
                type: EN_TEX_TYPE.TEXTURE_2D,
                width,
                height,
                depth: 1,
                arraySize: 1,
                mipLevels: 1,
                format: EN_FORMAT.R32G32B32A32_FLOAT,
                sampleCount: 1,
                usage: EN_USAGE.DEFAULT,
                bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                clear: {},
                layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
                name: url,
            };

            const data: SubresourceData = {
                dataPtr: rgba,
                rowRitch: width * getFormatStride(desc.format),
                slicePitch: 0
            };
            this._envTexture = this._graphicsDevice.createTexture(desc, [data]);

            this._isEquirectangular = true;

            this._createCubeMap();
        }
    }

    public update() {
        const { cameras, transforms } = scene.components;

        for (const entity of query(scene, [cameras, transforms])) {
            const cameraComponent = cameras[entity];
            if (cameraComponent.isPrimary) {
                const { inverse_view_projection } = cameraComponent;
                const { translation } = transforms[entity];
                if (inverse_view_projection && translation) {
                    this._cameraUniform.set(inverse_view_projection);
                    this._cameraUniform.set(translation, inverse_view_projection.length);
                    this._cameraUniformBuffer.update(this._cameraUniform);
                }
                break;
            }
        }
    }

    public renderEnvMap(cmd: RenderCommandBuffer, mipmapGenerator: MipmapGenerator) {
        if (!this._envTexture || !this._skyEnvPipeline
            || !this._enable || !this._envrenderingColorTexture) {
            return;
        }
        this._setupEnvCameras();

        this._graphicsDevice.beginEvent(cmd, "render envmap");
        for (let i = 0; i < 6; i++) {
            this._graphicsDevice.beginRenderPass(cmd, [
                RenderPassImage.renderTarget({ resource: this._envrenderingColorTexture, load_op: EN_LOAD_OP.CLEAR, subresource_RTV: i }),
                RenderPassImage.depthStencil({ resource: this._envrenderingDepthTexture, load_op: EN_LOAD_OP.CLEAR, subresource_DSV: i })
            ]);
            this._graphicsDevice.bindPipeline(cmd, this._skyEnvPipeline);
            this._graphicsDevice.bindResource(cmd, this._camerasUniformBuffer, 0);
            this._graphicsDevice.bindResource(cmd, this._paramsUniforms[i], 1);
            this._graphicsDevice.bindResource(cmd, this._envTexture, 2);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_WRAP)!, 3);
            this._graphicsDevice.drawInstanced(cmd, 240, 1, 0, 0);
            this._graphicsDevice.endRenderPass(cmd);
        }
        this._graphicsDevice.endEvent(cmd);

        mipmapGenerator.render(cmd, this._envrenderingColorTexture, EN_MIPGENFILTER.LINEAR);

        this._filterEnvMap(cmd);
    }

    public render(cmd: RenderCommandBuffer) {
        if (!this._skyPipeline || !this._envTexture || !this._enable) {
            return;
        }
        this._graphicsDevice.bindPipeline(cmd, this._isEquirectangular ? this._skyCubemapPipeline : this._skyPipeline);
        this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_WRAP)!, 0);
        this._graphicsDevice.bindResource(cmd, this._envTexture, 1);
        if (this._isEquirectangular) {
            this._graphicsDevice.bindResource(cmd, this._cameraUniformBuffer, 2);
        }
        this._graphicsDevice.draw(cmd, 3);
    }

    public get envrenderingColorTextureFiltered() {
        return this._envrenderingColorTextureFiltered;
    }

    // GGX importance sampling + Monte Carlo for specular IBL
    private _filterEnvMap(cmd: RenderCommandBuffer) {
        if (!this._filterEnvMapPipeline) {
            return;
        }
        const { desc: { width, height, mipLevels } } = this._envrenderingColorTextureFiltered;
        let w = width;
        let h = height;

        this._graphicsDevice.beginEvent(cmd, 'filter envmap');

        const filteredEnvmapBuffers: WGPUBuffer[] = [];
        for (let i = 0; i < mipLevels; i++) {
            filteredEnvmapBuffers.push(this._setupUniformBuffer([width, height, 1 / width, 1 / height, 0, 0, 0, 0], 'filter envmap params'));
        }

        this._graphicsDevice.copyTexture(cmd, this._envrenderingColorTexture, this._envrenderingColorTextureFiltered);

        this._graphicsDevice.beginComputePass(cmd);
        this._graphicsDevice.bindComputePipeline(cmd, this._filterEnvMapPipeline);

        const mipStart = mipLevels - 1;
        w = Math.max(1, w >> mipStart);
        h = Math.max(1, h >> mipStart);
        for (let i = mipStart; i > 0; i--) {
            filteredEnvmapBuffers[i].update(new Float32Array([w, h, 1 / w, 1 / h, i / mipStart, 1024, 0, 0]));

            this._graphicsDevice.bindResource(cmd, filteredEnvmapBuffers[i], 0);
            this._graphicsDevice.bindResource(cmd, this._envrenderingColorTexture, 1);
            this._graphicsDevice.bindSampler(cmd, this._resoueces.getSampler(EN_SAMPLER_TYPE.LINEAR_WRAP)!, 2);
            this._graphicsDevice.bindUAV(cmd, this._envrenderingColorTextureFiltered, 3, i);
            this._graphicsDevice.dispatch(
                cmd,
                Math.max(1, Math.floor((w + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE)),
                Math.max(1, Math.floor((h + GENERATEMIPCHAIN_2D_BLOCK_SIZE - 1) / GENERATEMIPCHAIN_2D_BLOCK_SIZE)),
                6);

            w *= 2;
            h *= 2;
        }

        this._graphicsDevice.endComputePass(cmd);

        this._graphicsDevice.endEvent(cmd);
    }

    private _createCubeMap() {
        const resolution = 64;
        {
            const texDesc: TextureDesc = {
                type: EN_TEX_TYPE.TEXTURE_2D,
                arraySize: 6,
                width: resolution,
                height: resolution,
                usage: EN_USAGE.DEFAULT,
                layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
                miscFlags: EN_RESOURCE_MISC_FLAG.TEXTURECUBE,
                sampleCount: 1,

                depth: 1,
                clear: { depth: 1, stencil: 0 },
                mipLevels: 1,
                bindFlags: EN_BIND_FLAG.RENDER_TARGET | EN_BIND_FLAG.DEPTH_STENCIL | EN_BIND_FLAG.SHADER_RESOURCE,
                format: EN_FORMAT.D16_UNORM,
                name: "env depth texture",
            };

            this._envrenderingDepthTexture = this._graphicsDevice.createTexture(texDesc);
        }
        {
            const texDesc: TextureDesc = {
                type: EN_TEX_TYPE.TEXTURE_2D,
                arraySize: 6,
                width: resolution,
                height: resolution,
                usage: EN_USAGE.DEFAULT,
                layout: EN_RESOURCE_STATE.SHADER_RESOURCE,
                miscFlags: EN_RESOURCE_MISC_FLAG.TEXTURECUBE,
                sampleCount: 1,

                depth: 1,
                clear: { color: vec4.create() },
                mipLevels: getMipCount(resolution, resolution, 1, 16),
                bindFlags: EN_BIND_FLAG.RENDER_TARGET | EN_BIND_FLAG.UNORDERED_ACCESS | EN_BIND_FLAG.SHADER_RESOURCE,
                format: EN_FORMAT.R32G32B32A32_FLOAT,
                name: "env color texture",
            };

            this._envrenderingColorTexture = this._graphicsDevice.createTexture(texDesc);

            // for (let i = 0; i < texDesc.mipLevels; i++) {
            //     this._graphicsDevice.createSubresource(
            //         this._envrenderingColorTexture, EN_SUBRESOURCE_TYPE.SRV, 0, texDesc.arraySize, i, 1);
            //     this._graphicsDevice.createSubresource(
            //         this._envrenderingColorTexture, EN_SUBRESOURCE_TYPE.UAV, 0, texDesc.arraySize, i, 1);
            // }

            texDesc.bindFlags = EN_BIND_FLAG.UNORDERED_ACCESS | EN_BIND_FLAG.SHADER_RESOURCE;
            texDesc.name = "Env Color Texture Filtered";

            this._envrenderingColorTextureFiltered = this._graphicsDevice.createTexture(texDesc);

            // for (let i = 0; i < texDesc.mipLevels; i++) {
            //     this._graphicsDevice.createSubresource(
            //         this._envrenderingColorTextureFiltered, EN_SUBRESOURCE_TYPE.SRV, 0, texDesc.arraySize, i, 1);
            //     this._graphicsDevice.createSubresource(
            //         this._envrenderingColorTextureFiltered, EN_SUBRESOURCE_TYPE.UAV, 0, texDesc.arraySize, i, 1);
            // }
        }
    }

    private _setupEnvCameras() {
        const E = vec3.create();

        const dirs = [
            vec3.fromValues(1, 0, 0),
            vec3.fromValues(-1, 0, 0),
            vec3.fromValues(0, 1, 0),
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, 0, 1),
            vec3.fromValues(0, 0, -1)];
        const ups = [
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, 0, 1),
            vec3.fromValues(0, 0, -1),
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, -1, 0)];

        for (let i = 0; i < dirs.length; i++) {
            const V = mat4.lookAt(mat4.create(), E, dirs[i], ups[i]);
            const { width, height } = this._graphicsDevice.canvas;
            const P = mat4.perspectiveZO(mat4.create(), glMatrix.toRadian(90), width / height, 0, 1);

            this._camerasUniform.set(mat4.mul(mat4.create(), P, V), i * 16);
        }

        this._camerasUniformBuffer.update(this._camerasUniform);
    }

    private _setupPipeline() {
        const bs: BlendState = {
            renderTarget: [
                {
                    srcBlend: EN_BLEND.SRC_ALPHA,
                    destBlend: EN_BLEND.INV_SRC_ALPHA,
                    blendOp: EN_BLEND_OP.ADD,
                    srcBlendAlpha: EN_BLEND.ONE,
                    destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
                    blendOpAlpha: EN_BLEND_OP.ADD,
                    blendEnable: false,
                    renderTargetWriteMask: EN_COLOR_WRITE.ENABLE_ALL
                },
                {
                    srcBlend: EN_BLEND.SRC_ALPHA,
                    destBlend: EN_BLEND.INV_SRC_ALPHA,
                    blendOp: EN_BLEND_OP.ADD,
                    srcBlendAlpha: EN_BLEND.ONE,
                    destBlendAlpha: EN_BLEND.INV_SRC_ALPHA,
                    blendOpAlpha: EN_BLEND_OP.ADD,
                    blendEnable: false,
                    renderTargetWriteMask: EN_COLOR_WRITE.DISABLE
                }
            ],
            alphaToCoverageEnable: false,
            independentBlendEnable: true,
        };

        const rs: RasterizerState = {
            fillMode: EN_FILL_MODE.SOLID,
            cullMode: EN_CULL_MODE.NONE, // todo: Front
            depthBias: 0,
            depthBiasClamp: 0,
            slopeScaledDepthBias: 0,
            depthClipEnable: false,
            multisampleEnable: true,
            antialiasedLineEnable: false,
            conservativeRasterizationEnable: false,

            forcedSampleCount: 0,
            lineWidth: 1,
            frontCounterClockwise: true,
        };

        const dss: DepthStencilState = {
            depthEnable: true,
            stencilEnable: false,
            depthBoundsTestEnable: false,
            depthWriteMask: EN_DEPTH_WRITE_MASK.ZERO,
            depthFunc: EN_COMPARISION_FUNC.LESS_EQUAL,
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

        this._skyPipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(fullScreenVertexShader),
            ps: this._graphicsDevice.createShaderByCode(skyStaticPixelShader),
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            bs,
            rs,
            dss,

            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'sky',
        });

        this._skyCubemapPipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(fullScreenVertexShader),
            ps: this._graphicsDevice.createShaderByCode(skyCubemapPixelShader),
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            bs,
            rs,
            dss,

            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'sky cubemap',
        });

        this._skyEnvPipeline = this._graphicsDevice.createPipeline({
            vs: this._graphicsDevice.createShaderByCode(skyStaticEnvVertexShader),
            ps: this._graphicsDevice.createShaderByCode(skyStaticEnvPixelShader),
            topology: EN_PRIMITIVE_TOPOLOGY.TRIANGLELIST,

            bs,
            rs,
            dss,

            patchControlPoints: 1,

            sampleMask: 0xFFFFFFFF,
            name: 'sky env map',
        });

        this._filterEnvMapPipeline = this._graphicsDevice.createComputePipelineByCode(filterEnvShader);
    }
}
