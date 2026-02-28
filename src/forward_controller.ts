import { vec3, mat4 } from "gl-matrix";
import { Controller } from "@eric-schecter/renderer";

export class ForwardController extends Controller {
    private _speed = vec3.fromValues(0, 0, -88);

    public constructor() {
        super();

        this.pos = vec3.fromValues(0, 0, 0);
        this.focus = vec3.fromValues(0, 0, -1);
    }

    public set speed(value: vec3) {
        this._speed = value;
    }

    public getMatrix(): mat4 {
        return mat4.lookAt(mat4.create(), this.pos, this.focus, this.up);
    }

    public update(dt: number): void {
        const offset = vec3.scale(vec3.create(), this._speed, dt);
        this.pos = vec3.add(vec3.create(), this.pos, offset);
        this.focus = vec3.add(vec3.create(), this.focus, offset);
    }

    public stop(): void {

    }

    public destroy(): void { }
}
