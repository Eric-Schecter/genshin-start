import { vec3, mat4 } from "gl-matrix";
import { Controller } from "./renderer";

export class ForwardController extends Controller {
    private _speed = vec3.fromValues(0, 0, -88);

    public constructor() {
        super();

        this.pos = vec3.fromValues(0, 0, 1);
    }

    public getMatrix(): mat4 {
        return mat4.lookAt(mat4.create(), this.pos, this.focus, this.up);
    }

    public update(dt: number): void {
        if (true) {
            const offset = vec3.scale(vec3.create(), this._speed, dt);
            this.pos = vec3.add(vec3.create(), this.pos, offset);
            this.focus = vec3.add(vec3.create(), this.focus, offset);
        }
    }

    public stop(): void {

    }

    public destroy(): void { }
}
