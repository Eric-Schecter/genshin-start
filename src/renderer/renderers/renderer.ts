import {
    EN_BIND_FLAG,
    EN_RESOURCE_MISC_FLAG,
    EN_USAGE,
    GPUBufferDesc,
    GraphicsDevice, RenderCommandBuffer
} from "@eric-schecter/graphics";

export abstract class Renderer {
    public constructor(protected _graphicsDevice: GraphicsDevice) { }

    public abstract update(dt: number, et: number): void;
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
}
