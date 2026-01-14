import { mat4, quat, vec3, vec4 } from "gl-matrix";

export abstract class Controller {
    private _up = vec3.fromValues(0, 1, 0);

    private _focus = vec3.fromValues(0, 0, 0);

    private _pos = vec3.fromValues(2, 1.5, 2);

    protected _rotation = quat.create();

    protected _motion = vec4.create();

    protected _zoom = 0;

    protected _viewMatrix = mat4.create();

    protected _viewMatrixInv = mat4.create();

    protected _dirty = true;

    public update(dt: number): void { };

    public stop(): void { };

    public abstract getMatrix(): mat4;

    public abstract destroy(): void;

    public get dirty() {
        return this._dirty;
    }

    public set dirty(value: boolean) {
        this._dirty = value;
    }

    public get up() {
        return this._up;
    }

    public set up(value: vec3) {
        this._up = value;
        this._dirty = true;
    }

    public get pos() {
        return this._pos;
    }

    public set pos(value: vec3) {
        this._pos = value;
        this._dirty = true;
    }

    public get focus() {
        return this._focus;
    }

    public set focus(value: vec3) {
        this._focus = value;
        this._dirty = true;
    }

    public getZoom() {
        return this._zoom;
    }

    public get motion() {
        return this._motion;
    }

    public get rotation() {
        return this._rotation;
    }

    public get viewMatrix() {
        return this._viewMatrix;
    }
}
