import { vec4, quat, vec2, vec3, mat4, mat3 } from "gl-matrix";
import { Controller } from "./controller";
import { getFocus, getPos } from "../utils";

export class FirstPersonController extends Controller {
    private _keysPressed = new Set<string>();

    private _preMousePos = vec2.create();

    private _isDragging = false;

    private _speed = 30;

    constructor(private _canvas: HTMLCanvasElement) {
        super();
        this._registerEvents();
    }

    public getMatrix(dt: number) {
        if (!this.dirty) {
            return this._viewMatrix;
        }
        let x = 0;
        let z = 0;

        const speed = this._speed * dt * 10;

        if (this._keysPressed.has('w')) z -= speed;
        if (this._keysPressed.has('s')) z += speed;
        if (this._keysPressed.has('a')) x -= speed;
        if (this._keysPressed.has('d')) x += speed;

        const dir = vec3.sub(vec3.create(), this.focus, this.pos);

        const currentZoom = vec3.len(dir);

        const zAxis = vec3.normalize(vec3.create(), dir);
        const xAxis = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), zAxis, vec3.normalize(vec3.create(), this.up)));
        const yAxis = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), xAxis, zAxis));

        const xOffset = vec3.scale(vec3.create(), xAxis, x);
        const zOffset = vec3.scale(vec3.create(), zAxis, -z);
        const moveOffset = vec3.add(vec3.create(), xOffset, zOffset);

        const zoomOffset = vec3.fromValues(0, 0, this._zoom * currentZoom);

        const motionMat4 = mat4.translate(mat4.create(), mat4.create(), zoomOffset);

        const focusMat4 = mat4.translate(
            mat4.create(),
            mat4.create(),
            vec3.add(vec3.create(), this.focus, moveOffset));
        const focusMat4Inv = mat4.invert(mat4.create(), focusMat4) as mat4;

        const centerTranslation = mat4.mul(mat4.create(), motionMat4, focusMat4Inv);

        const zoomMat4 = mat4.translate(mat4.create(), mat4.create(), vec3.fromValues(0, 0, -currentZoom));
        const zoomOffsetMat4 = mat4.translate(mat4.create(), mat4.create(), zoomOffset);
        const translation = mat4.mul(mat4.create(), zoomOffsetMat4, zoomMat4);

        const currMat3 = mat3.fromValues(
            xAxis[0], yAxis[0], -zAxis[0],
            xAxis[1], yAxis[1], -zAxis[1],
            xAxis[2], yAxis[2], -zAxis[2]
        );
        const rotation = quat.fromMat3(quat.create(), currMat3);
        quat.normalize(rotation, rotation);

        const rotationQuat = quat.mul(quat.create(), this.rotation, rotation);
        const rotationMat4 = mat4.fromQuat(mat4.create(), rotationQuat);

        const viewMatrix = centerTranslation;
        mat4.mul(viewMatrix, rotationMat4, viewMatrix);
        mat4.mul(viewMatrix, translation, viewMatrix);

        mat4.invert(this._viewMatrixInv, viewMatrix);

        this.pos = getPos(this._viewMatrixInv);
        const focus = getFocus(this._viewMatrixInv);

        const dis = vec3.len(vec3.sub(vec3.create(), this.focus, this.pos));
        vec3.sub(this.focus, this.pos, vec3.scale(vec3.create(), focus, dis));

        this._reset();

        return viewMatrix;
    }

    public get dirty() {
        return this._dirty || this._keysPressed.size !== 0;
    }

    public destroy() {
        this._canvas.removeEventListener('mousedown', this._mousedown);
        this._canvas.removeEventListener('mousemove', this._mousemove);
        window.removeEventListener('mouseup', this._mouseup);
        window.removeEventListener('keydown', this._keydown);
        window.removeEventListener('keyup', this._keyup);
    }

    public rotate(curPos: vec2) {
        const mouseCurrBall = this._screenToArcball(curPos);
        const mousePrevBall = this._screenToArcball(this._preMousePos);

        quat.normalize(this._rotation, quat.mul(this._rotation, mouseCurrBall, mousePrevBall));

        this._dirty = true;
    }

    public pan(delta: vec2) {
        this._motion = vec4.fromValues(delta[0], delta[1], 0, 0);

        this._dirty = true;
    }

    private _registerEvents() {
        this._canvas.addEventListener('mousedown', this._mousedown);
        this._canvas.addEventListener('mousemove', this._mousemove);
        window.addEventListener('mouseup', this._mouseup);
        window.addEventListener('keydown', this._keydown);
        window.addEventListener('keyup', this._keyup);
    }

    private _reset() {
        this._rotation = quat.create();
        this._zoom = 0;
        this._motion = vec4.create();

        this._dirty = false;
    }

    private _keydown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        this._keysPressed.add(e.key.toLowerCase());
        this._dirty = true;
    }

    private _keyup = (e: KeyboardEvent) => {
        this._keysPressed.delete(e.key.toLowerCase());
        this._dirty = true;
    }

    private _screenToNDC(pos: vec2, size: vec2) {
        const ndc = vec2.create();
        ndc[0] = (2 * pos[0]) / size[0] - 1;
        ndc[1] = -(1 - (2 * pos[1]) / size[1]);
        ndc[0] = Math.max(Math.min(ndc[0], 1), -1);
        ndc[1] = Math.max(Math.min(ndc[1], 1), -1);
        ndc[1] = -ndc[1];
        return ndc;
    }

    private _screenToArcball(p: vec2) {
        const dist = vec2.dot(p, p);
        if (dist <= 1) {
            const z = Math.sqrt(Math.max(0, 1 - dist));
            const q = quat.create();
            quat.set(q, p[0], p[1], z, 0.0);
            return q;
        }

        const proj = vec2.normalize(vec2.create(), p);
        const q = quat.create();
        quat.set(q, proj[0], proj[1], 0.0, 0.0);
        return q;
    }

    private _mousedown = (e: MouseEvent) => {
        this._isDragging = true;
        this._preMousePos = this._screenToNDC(vec2.fromValues(e.offsetX, e.offsetY), vec2.fromValues(this._canvas.width, this._canvas.height));
    }

    private _mousemove = (e: MouseEvent) => {
        if (!this._isDragging) {
            return;
        }

        const curMousePos = this._screenToNDC(vec2.fromValues(e.offsetX, e.offsetY), vec2.fromValues(this._canvas.width, this._canvas.height));
        if (e.button === 0) {
            this.rotate(curMousePos)
        } else if (e.button === 2) {
            this.pan(curMousePos);
        }
        this._preMousePos = curMousePos;
    }

    private _mouseup = () => {
        this._isDragging = false;
    }
}
