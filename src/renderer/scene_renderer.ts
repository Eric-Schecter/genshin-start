import {
    GraphicsDevice, EN_FORMAT, EN_BIND_FLAG, EN_RESOURCE_MISC_FLAG, EN_USAGE, EN_RESOURCE_STATE,
    WGPUTexture, EN_TEX_TYPE, RenderPassImage, EN_LOAD_OP, RenderCommandBuffer
} from "@eric-schecter/graphics";
import {  vec4 } from 'gl-matrix';
import { ArcBallController, Controller } from './controller';
import { SkyRenderer, Renderer, MipmapGenerator, ImageRenderer, MeshRenderer } from './renderers';
import { ModelLoader } from './model_loader';
import { Tonemap } from './pass/tonemap';
import { CameraSystem, defaultCameraComponent, defaultTransformComponent, scene, TransformSystem } from "./ecs";
import { addComponent, addEntity, query } from "bitecs";
import { MeshSystem } from "./ecs/systems/mesh_system";
import { MaterialSystem } from "./ecs/systems/material_system";

export class SceneRenderer extends Renderer {
    private _needUpdate = 1;
    private _alwaysUpdate = 1;

    private _colorTexture: WGPUTexture;

    private _depthStencilTexture: WGPUTexture;

    private _resolvedTexture1: WGPUTexture;
    private _resolvedTexture2: WGPUTexture;

    private _textures: WGPUTexture[] = [];

    private _skyRenderer: SkyRenderer;
    private _imageRenderer: ImageRenderer;
    private _meshRenderer: MeshRenderer;
    private _mipmapGenerator: MipmapGenerator;

    private _tonemap: Tonemap;

    private _transformSystem: TransformSystem;
    private _cameraSystem: CameraSystem;
    private _meshSystem: MeshSystem;
    private _materialSystem: MaterialSystem;

    private _time: number;

    protected _modelLoader: ModelLoader;
    protected _controller: Controller;

    // private _debug = false;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._transformSystem = new TransformSystem();
        this._cameraSystem = new CameraSystem();
        this._meshSystem = new MeshSystem();
        this._materialSystem = new MaterialSystem();

        this._skyRenderer = new SkyRenderer(graphicsDevice);
        this._imageRenderer = new ImageRenderer(graphicsDevice);
        this._mipmapGenerator = new MipmapGenerator(graphicsDevice);
        this._modelLoader = new ModelLoader();

        this._meshRenderer = new MeshRenderer(graphicsDevice);
        this._skyRenderer.load('images/birchwood_4k.hdr');
        // this._skyRenderer.load('images/HDR_Light_Studio_Free_HDRI_Design_14.hdr');
        this._createTextures();

        this._tonemap = new Tonemap(graphicsDevice);

        this._setupDefaultCamera();

        this._time = performance.now();

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

    public update(dt: number) {
        if (!this._controller) {
            this._controller = new ArcBallController(this._graphicsDevice.canvas);
        }

        this._needUpdate += this._meshSystem.update(this._graphicsDevice);
        this._needUpdate += this._materialSystem.update(this._graphicsDevice);
        this._needUpdate += this._cameraSystem.update(this._graphicsDevice, this._controller);
        this._needUpdate += this._transformSystem.update(this._graphicsDevice);

        this._skyRenderer.update();
    }

    public render(): void {
        let now = performance.now();
        let deltaTime = now - this._time;
        this.update(deltaTime * 0.001);
        this._time = now;

        if (this._needUpdate) {
            const cmd = this._graphicsDevice.beginCommand();

            this._preprocess(cmd);

            this._renderScene(cmd);

            const res = this._postprocess(cmd);

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

    private _preprocess(cmd: RenderCommandBuffer) {
        this._skyRenderer.renderEnvMap(cmd, this._mipmapGenerator);
    }

    private _renderScene(cmd: RenderCommandBuffer) {
        this._graphicsDevice.beginEvent(cmd, 'render mesh');
        this._graphicsDevice.beginRenderPass(cmd,
            [RenderPassImage.renderTarget({ resource: this._colorTexture, resolveTarget: this._resolvedTexture1, load_op: EN_LOAD_OP.CLEAR }),
            RenderPassImage.depthStencil({ resource: this._depthStencilTexture, load_op: EN_LOAD_OP.CLEAR })]
        );

        this._meshRenderer.render(cmd, this._skyRenderer.envrenderingColorTextureFiltered);

        this._skyRenderer.render(cmd);

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

    private _postprocess(cmd: RenderCommandBuffer) {
        this._tonemap.render(cmd, this._resolvedTexture1, this._resolvedTexture2);

        [this._resolvedTexture2, this._resolvedTexture1] = [this._resolvedTexture1, this._resolvedTexture2];

        return this._resolvedTexture1;
    }

    private _setupDefaultCamera() {
        const { width, height } = this._graphicsDevice.canvas;

        const { cameras, transforms } = scene.components;
        const cameraEntity = addEntity(scene);
        addComponent(scene, cameraEntity, cameras);
        cameras[cameraEntity] = { ...defaultCameraComponent };
        const cameraComponent = cameras[cameraEntity];

        cameraComponent.isPrimary = true;
        cameraComponent.fov = 45;
        cameraComponent.aspect = width / height;
        cameraComponent.near = 50;
        cameraComponent.far = 100000;

        addComponent(scene, cameraEntity, transforms);
        transforms[cameraEntity] = { ...defaultTransformComponent };
    }

    private _createTextures() {
        const { width, height } = this._graphicsDevice.canvas;
        const sampleCount = 4;

        const colorFormat = EN_FORMAT.R16G16B16A16_FLOAT;

        {
            this._colorTexture = this._graphicsDevice.createTexture({
                type: EN_TEX_TYPE.TEXTURE_2D,
                width,
                height,
                depth: 1,
                arraySize: 1,
                mipLevels: 1,
                usage: EN_USAGE.DEFAULT,
                format: colorFormat,
                sampleCount,
                bindFlags: EN_BIND_FLAG.RENDER_TARGET,
                miscFlags: EN_RESOURCE_MISC_FLAG.NONE,
                clear: { color: vec4.fromValues(0.2, 0.2, 0.2, 1) },
                layout: EN_RESOURCE_STATE.RENDERTARGET,
                name: 'color render target'
            });
        }

        {
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
        }

        {
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
            this._resolvedTexture1 = this._graphicsDevice.createTexture(desc);
            this._resolvedTexture2 = this._graphicsDevice.createTexture(desc);
        }

        this._textures.push(
            this._colorTexture,
            this._depthStencilTexture,
            this._resolvedTexture1,
            this._resolvedTexture2);
    }

    // private async _getDataFromBuffer(buffer: WGPUBuffer, width: number, height: number, bytesPerRow: number) {
    //     await buffer.resource.mapAsync(GPUMapMode.READ);
    //     const mappedData = buffer.resource.getMappedRange();
    //     // const data = new Uint8ClampedArray(buffer.mappedData);

    //     const data = new Float32Array(mappedData);

    //     const imageData = new ImageData(width, height);
    //     console.log(width, height,111);
    //     for (let y = 0; y < height; y++) {
    //         for (let x = 0; x < width; x++) {
    //             const srcIdx = y * bytesPerRow + x * 4;
    //             const dstIdx = (y * width + x) * 4;

    //             imageData.data[dstIdx] = data[srcIdx + 2] * 255;     // R
    //             imageData.data[dstIdx + 1] = data[srcIdx + 1]* 255; // G
    //             imageData.data[dstIdx + 2] = data[srcIdx]* 255;     // B
    //             imageData.data[dstIdx + 3] = data[srcIdx + 3]* 255; // A
    //         }
    //     }

    //     console.log(data,11133);

    //     buffer.resource.unmap();

    //     return imageData;
    // }

    // private async _displayMipmaps(texture: WGPUTexture) {
    //     const maxWidth = 512;
    //     const padding = 4;
    //     const backgroundColor = '#1a1a1a';
    //     const showInfo = true;

    //     const canvas = document.createElement('canvas');
    //     canvas.style.position = 'fixed';
    //     canvas.style.top = '0px';
    //     canvas.style.left = '0px';
    //     const ctx = canvas.getContext('2d')!;

    //     const mipLevels = texture.resource.mipLevelCount || 1;
    //     let totalWidth = 0, maxHeight = 0;
    //     const mipSizes = [];

    //     for (let level = 0; level < mipLevels; level++) {
    //         const width = Math.max(1, texture.resource.width >> level);
    //         const height = Math.max(1, texture.resource.height >> level);

    //         const scale = Math.min(1, maxWidth / width);
    //         const displayWidth = width * scale;
    //         const displayHeight = height * scale;

    //         mipSizes.push({ width, height, displayWidth, displayHeight });
    //         totalWidth += displayWidth + padding;
    //         maxHeight = Math.max(maxHeight, displayHeight);
    //     }

    //     canvas.width = totalWidth;
    //     canvas.height = maxHeight + (showInfo ? 30 : 0);

    //     ctx.fillStyle = backgroundColor;
    //     ctx.fillRect(0, 0, canvas.width, canvas.height);

    //     const alignedBytes = 256;
    //     let x = 0;
    //     for (let level = 0; level < mipLevels; level++) {
    //         const { width, height, displayWidth, displayHeight } = mipSizes[level];

    //         const bytesPerRow = alignTo(width * alignedBytes, alignedBytes);
    //         const bufferSize = bytesPerRow * height;

    //         const cmdBuffer = new CopyCommandBuffer(this._graphicsDevice, EN_USAGE.READBACK, bufferSize);

    //         const cmd = cmdBuffer.begin();

    //         this._graphicsDevice.copyTextureToBuffer(cmd, cmdBuffer.stagingBuffer, 0, texture, level);

    //         cmdBuffer.end();

    //         const imageData = await this._getDataFromBuffer(cmdBuffer.stagingBuffer, width, height, bytesPerRow);

    //         {
    //             ctx.putImageData(imageData, 0, 0, 0, 0, width, height);

    //             ctx.drawImage(
    //                 ctx.canvas,
    //                 0, 0, width, height,
    //                 x, 0, displayWidth, displayHeight
    //             );

    //             ctx.strokeStyle = '#666';
    //             ctx.strokeRect(x, 0, displayWidth, displayHeight);

    //             if (showInfo) {
    //                 ctx.fillStyle = 'white';
    //                 ctx.font = '12px monospace';
    //                 ctx.fillText(
    //                     `L${level}: ${width}×${height}`,
    //                     x + 5,
    //                     displayHeight + 20
    //                 );
    //             }

    //             x += displayWidth + padding;
    //         }
    //     }

    //     return canvas;
    // }
}
