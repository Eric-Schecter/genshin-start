import {
    GraphicsDevice, EN_FORMAT, EN_BIND_FLAG, EN_RESOURCE_MISC_FLAG, EN_USAGE, EN_RESOURCE_STATE,
    WGPUTexture, EN_TEX_TYPE, RenderPassImage, EN_LOAD_OP, RenderCommandBuffer,
    WGPUBuffer
} from "@eric-schecter/graphics";
import { vec4 } from 'gl-matrix';
import { ArcBallController, Controller } from './controller';
import {
    SkyRenderer, Renderer, MipmapGenerator, ImageRenderer, MeshRenderer,
    ShadowRenderer,
    ResourceManager,
} from './renderers';
import { ModelLoader } from './model_loader';
import { Tonemap, Bloom, Gaussian } from './pass';
import {
    CameraSystem, creaetDefaultTransformComponent, scene, TransformSystem,
    MeshSystem, MaterialSystem,
    createDefaultCameraComponent,
    LightSystem
} from "./ecs";
import { addComponent, addEntity, query } from "bitecs";
import { floatSize, maxInstanceCount } from "./constant";

export enum EN_ENABLE_FLAG {
    NONE = 0,
    BLOOM = 1,
    MULTI_SAMPLE = 1 << 1,
}

export class SceneRenderer extends Renderer {
    private _needUpdate = 1;
    private readonly _alwaysUpdate = 1;

    protected readonly _resourceManager: ResourceManager;

    private _colorTexture1: WGPUTexture;
    private _resolvedTexture: WGPUTexture;
    private _colorTexture2: WGPUTexture;

    private _depthStencilTexture: WGPUTexture;
    private _linearDepthTexture: WGPUTexture;

    private _resolvedTextureDepth: WGPUTexture;

    private readonly _textures: WGPUTexture[] = [];

    protected _skyRenderer: SkyRenderer;
    private readonly _shadowRenderer: ShadowRenderer;
    private readonly _imageRenderer: ImageRenderer;
    protected _meshRenderer: MeshRenderer;
    protected _renderers: Renderer[] = [];
    private readonly _mipmapGenerator: MipmapGenerator;
    private readonly _gaussian: Gaussian;

    private readonly _tonemap: Tonemap;
    private readonly _bloom: Bloom;

    private readonly _transformSystem: TransformSystem;
    private readonly _cameraSystem: CameraSystem;
    private readonly _lightSystem: LightSystem;
    private readonly _meshSystem: MeshSystem;
    private readonly _materialSystem: MaterialSystem;

    private _time: number;
    private readonly _startTime: number;

    protected _modelLoader: ModelLoader;
    protected _controller: Controller;

    private readonly _renderBatch = new Map<number, number[]>(); // mesh entity -> object entities

    private readonly _instanceStorageBuffer: WGPUBuffer;

    private _enableFlag = EN_ENABLE_FLAG.NONE;

    // private _debug = false;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this.enable(EN_ENABLE_FLAG.MULTI_SAMPLE);

        this._resourceManager = new ResourceManager(graphicsDevice);

        this._transformSystem = new TransformSystem();
        this._cameraSystem = new CameraSystem();
        this._lightSystem = new LightSystem();
        this._meshSystem = new MeshSystem();
        this._materialSystem = new MaterialSystem();

        this._skyRenderer = new SkyRenderer(graphicsDevice, this._resourceManager);
        this._imageRenderer = new ImageRenderer(graphicsDevice, this._resourceManager);
        this._gaussian = new Gaussian(graphicsDevice, this._resourceManager);
        this._mipmapGenerator = new MipmapGenerator(graphicsDevice, this._resourceManager, this._gaussian);
        this._modelLoader = new ModelLoader();

        this._meshRenderer = new MeshRenderer(graphicsDevice, this._resourceManager);
        this._shadowRenderer = new ShadowRenderer(graphicsDevice);

        this._tonemap = new Tonemap(graphicsDevice, this._resourceManager);
        this._bloom = new Bloom(graphicsDevice, this._resourceManager);

        this._time = performance.now();
        this._startTime = this._time;

        this._renderers.push(this._skyRenderer);

        this._createTextures();

        this._setupDefaultCamera();

        this._instanceStorageBuffer = graphicsDevice.createBuffer({
            size: maxInstanceCount * 64 * floatSize,
            name: 'instance storage buffer',
            usage: EN_USAGE.DEFAULT,
            bindFlags: EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            stride: 0,
            count: maxInstanceCount,
        });

        const observer = new ResizeObserver(entries => {
            const { limits: { maxTextureDimension2D } } = this._graphicsDevice;
            for (const entry of entries) {
                const canvas = entry.target as HTMLCanvasElement;
                const width = entry.contentBoxSize[0].inlineSize;
                const height = entry.contentBoxSize[0].blockSize;
                canvas.width = Math.max(1, Math.min(width, maxTextureDimension2D));
                canvas.height = Math.max(1, Math.min(height, maxTextureDimension2D));
            }
            const canvas = entries[0].target as HTMLCanvasElement;
            const { width, height } = canvas;
            this._textures.forEach(texture => {
                texture.resize(width, height);
            })
            this._meshRenderer.resize(width, height);

            const { cameras } = scene.components;
            for (const entity of query(scene, [cameras])) {
                const cameraComponent = cameras[entity];
                if (cameraComponent.isPrimary) {
                    cameraComponent.aspect = width / height;
                    cameraComponent.dirty = true;
                    break;
                }
            }
        });
        observer.observe(this._graphicsDevice.canvas);
    }

    public enable(value: EN_ENABLE_FLAG) {
        this._enableFlag |= value;
    }

    public disable(value: EN_ENABLE_FLAG) {
        this._enableFlag &= ~value;
    }

    public isEnable(value: EN_ENABLE_FLAG): boolean {
        return (this._enableFlag & value) === value;
    }

    public update(dt: number, et: number) {
        if (!this._controller) {
            this._controller = new ArcBallController(this._graphicsDevice.canvas);
        }

        this._needUpdate += this._meshSystem.update(this._graphicsDevice);
        this._needUpdate += this._materialSystem.update(this._graphicsDevice);
        this._needUpdate += this._cameraSystem.update(this._graphicsDevice, this._controller, dt);
        this._needUpdate += this._lightSystem.update(this._graphicsDevice, this._shadowRenderer.shadowAtlas);
        this._needUpdate += this._transformSystem.update();

        this._renderers.forEach(renderer => renderer.update(dt, et));
        this._meshRenderer.update();
        this._shadowRenderer.update();

        this._meshRenderer.envTexture = this._skyRenderer.envrenderingColorTextureFiltered;
        this._meshRenderer.shadowAtlas = this._shadowRenderer.shadowAtlas;
    }

    public render(): void {
        let now = performance.now();
        let deltaTime = now - this._time;
        this.update(deltaTime * 0.001, (this._time - this._startTime) * 0.001);
        this._time = now;

        if (this._needUpdate) {
            const cmd = this._graphicsDevice.beginCommand();

            this._preprocess(cmd);

            this._renderScene(cmd);

            const colorTexture1 = this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE) ? this._resolvedTexture : this._colorTexture1;
            const res = this._postprocess(cmd, colorTexture1, this._colorTexture2);

            this._present(cmd, res);

            this._graphicsDevice.submit();
        }

        this._needUpdate = this._alwaysUpdate;

        requestAnimationFrame(() => this.render());
    }

    public destroy(): void {
        // todo: release scene resources

        this._controller.destroy();
    }

    private _buildRenderBatch() {
        const { objects, transforms, materials, meshes } = scene.components;

        this._renderBatch.clear();

        for (const entity of query(scene, [objects, transforms])) {
            const objectComponent = objects[entity];
            const meshEntities = objectComponent?.meshEntities;

            for (const meshEntity of meshEntities) {
                // todo
                const materialEntities = meshes[meshEntity].materialEntity;
                if (materialEntities.length === 0) {
                    continue;
                }
                if (materials[materialEntities[0]].type !== 'default') {
                    continue;
                }
                if (this._renderBatch.has(meshEntity)) {
                    this._renderBatch.get(meshEntity)?.push(entity);
                } else {
                    this._renderBatch.set(meshEntity, [entity]);
                }
            }
        }

        let count = 0;
        let stride = 64;
        for (const [_, objectEntities] of this._renderBatch) {
            count += objectEntities.length;
        }
        const data = new Float32Array(count * stride);

        let offset = 0;
        stride = 16;
        for (const [_, objectEntities] of this._renderBatch) {
            for (const entity of objectEntities) {
                const { worldMatrix, normalMatrix } = transforms[entity];
                data.set(worldMatrix, offset * stride);
                offset++;
                data.set(normalMatrix, offset * stride);
                offset++;
            }
        }

        this._instanceStorageBuffer.update(data);
    }

    private _preprocess(cmd: RenderCommandBuffer) {
        this._buildRenderBatch();
        this._skyRenderer.renderEnvMap(cmd, this._mipmapGenerator);
        this._shadowRenderer.render(cmd, this._renderBatch, this._instanceStorageBuffer);
    }

    private _renderScene(cmd: RenderCommandBuffer) {
        this._graphicsDevice.beginEvent(cmd, 'render mesh');

        if (this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE)) {
            this._graphicsDevice.beginRenderPass(cmd,
                [RenderPassImage.renderTarget({ resource: this._colorTexture1, resolveTarget: this._resolvedTexture, load_op: EN_LOAD_OP.CLEAR }),
                RenderPassImage.renderTarget({ resource: this._linearDepthTexture, resolveTarget: this._resolvedTextureDepth, load_op: EN_LOAD_OP.CLEAR }),
                RenderPassImage.depthStencil({ resource: this._depthStencilTexture, load_op: EN_LOAD_OP.CLEAR })]
            );
        } else {
            this._graphicsDevice.beginRenderPass(cmd,
                [RenderPassImage.renderTarget({ resource: this._colorTexture1, load_op: EN_LOAD_OP.CLEAR }),
                RenderPassImage.renderTarget({ resource: this._linearDepthTexture, load_op: EN_LOAD_OP.CLEAR }),
                RenderPassImage.depthStencil({ resource: this._depthStencilTexture, load_op: EN_LOAD_OP.CLEAR })]
            );
        }

        this._meshRenderer.render(cmd, this._renderBatch, this._instanceStorageBuffer);
        this._renderers.forEach(renderer => renderer.render(cmd));

        this._graphicsDevice.endRenderPass(cmd);
        this._graphicsDevice.endEvent(cmd);
    }

    private _present(cmd: RenderCommandBuffer, texture: WGPUTexture) {
        this._graphicsDevice.beginEvent(cmd, 'present');
        this._graphicsDevice.beginRenderPassSC(cmd);

        this._imageRenderer.render(cmd, texture);

        this._graphicsDevice.endRenderPass(cmd);
        this._graphicsDevice.endEvent(cmd);
    }

    private _postprocess(cmd: RenderCommandBuffer, tex1: WGPUTexture, tex2: WGPUTexture) {
        const linearDepthTexture = this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE) ? this._resolvedTextureDepth : this._linearDepthTexture;

        if (this.isEnable(EN_ENABLE_FLAG.BLOOM)) {
            this._bloom.render(cmd, tex1, linearDepthTexture, this._mipmapGenerator);
        }

        this._tonemap.render(
            cmd,
            tex1,
            tex2,
            this._bloom.exposure,
            this.isEnable(EN_ENABLE_FLAG.BLOOM) ? this._bloom.res : undefined);

        [tex1, tex2] = [tex2, tex1];

        return tex1;
    }

    private _setupDefaultCamera() {
        const { width, height } = this._graphicsDevice.canvas;

        const { cameras, transforms } = scene.components;
        const cameraEntity = addEntity(scene);
        addComponent(scene, cameraEntity, cameras);
        cameras[cameraEntity] = createDefaultCameraComponent();
        const cameraComponent = cameras[cameraEntity];

        cameraComponent.isPrimary = true;
        cameraComponent.fov = 45 / 180 * Math.PI;
        cameraComponent.aspect = width / height;
        cameraComponent.near = 50;
        cameraComponent.far = 100000;

        addComponent(scene, cameraEntity, transforms);
        transforms[cameraEntity] = creaetDefaultTransformComponent();
    }

    private _createTextures() {
        const { width, height } = this._graphicsDevice.canvas;

        const sampleCount = this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE) ? 4 : 1;

        const colorFormat = EN_FORMAT.R16G16B16A16_FLOAT;

        let bindFlags = EN_BIND_FLAG.RENDER_TARGET | EN_BIND_FLAG.SHADER_RESOURCE;
        if (!this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE)) {
            bindFlags |= EN_BIND_FLAG.UNORDERED_ACCESS;
        }

        this._colorTexture1 = this._graphicsDevice.createTexture({
            type: EN_TEX_TYPE.TEXTURE_2D,
            width,
            height,
            depth: 1,
            arraySize: 1,
            mipLevels: 1,
            usage: EN_USAGE.DEFAULT,
            format: colorFormat,
            sampleCount,
            bindFlags,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: { color: vec4.fromValues(0.2, 0.2, 0.2, 1) },
            layout: EN_RESOURCE_STATE.RENDERTARGET,
            name: 'color render target'
        });

        if (this.isEnable(EN_ENABLE_FLAG.MULTI_SAMPLE)) {
            const desc = {
                type: EN_TEX_TYPE.TEXTURE_2D,
                width,
                height,
                depth: 1,
                arraySize: 1,
                mipLevels: 1,
                usage: EN_USAGE.DEFAULT,
                format: colorFormat,
                sampleCount: 1,
                bindFlags: EN_BIND_FLAG.RENDER_TARGET | EN_BIND_FLAG.SHADER_RESOURCE | EN_BIND_FLAG.UNORDERED_ACCESS,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                clear: { color: vec4.fromValues(0.2, 0.2, 0.2, 1) },
                layout: EN_RESOURCE_STATE.RENDERTARGET,
                name: 'color render target resolved'
            };

            this._resolvedTexture = this._graphicsDevice.createTexture(desc);
            this._colorTexture2 = this._graphicsDevice.createTexture(desc);
            this._resolvedTextureDepth = this._graphicsDevice.createTexture({ ...desc, format: colorFormat, name: 'linear depth render target resolved' });

            this._textures.push(
                this._resolvedTexture,
                this._resolvedTextureDepth,
            );
        } else {
            this._colorTexture2 = this._graphicsDevice.createTexture(this._colorTexture1.desc);
        }

        this._linearDepthTexture = this._graphicsDevice.createTexture({
            type: EN_TEX_TYPE.TEXTURE_2D,
            width,
            height,
            depth: 1,
            arraySize: 1,
            mipLevels: 1, // todo
            usage: EN_USAGE.DEFAULT,
            format: colorFormat, // todo
            sampleCount,
            bindFlags: EN_BIND_FLAG.RENDER_TARGET | EN_BIND_FLAG.SHADER_RESOURCE,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: { color: vec4.fromValues(1, 1, 1, 1) },
            layout: EN_RESOURCE_STATE.RENDERTARGET,
            name: 'linear depth render target'
        });

        this._depthStencilTexture = this._graphicsDevice.createTexture({
            type: EN_TEX_TYPE.TEXTURE_2D,
            width,
            height,
            depth: 1,
            arraySize: 1,
            mipLevels: 1,
            usage: EN_USAGE.DEFAULT,
            format: EN_FORMAT.D24_UNORM_S8_UINT,
            sampleCount,
            bindFlags: EN_BIND_FLAG.RENDER_TARGET,
            miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
            clear: { depth: 1, stencil: 0 },
            layout: EN_RESOURCE_STATE.RENDERTARGET,
            name: 'depth stencil render target'
        });

        this._textures.push(
            this._colorTexture1,
            this._colorTexture2,
            this._linearDepthTexture,
            this._depthStencilTexture,
        );
    }
}
