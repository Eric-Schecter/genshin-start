import { vec3, mat4 } from 'gl-matrix';

export class BoundingBox {
    private _min: vec3;
    private _max: vec3;

    public constructor(min = vec3.fromValues(Infinity, Infinity, Infinity), max = vec3.fromValues(-Infinity, -Infinity, -Infinity)) {
        this._min = vec3.clone(min);
        this._max = vec3.clone(max);
    }

    static fromPositions(positions: vec3[]) {
        const bbox = new BoundingBox();
        bbox.expandByPositions(positions);
        return bbox;
    }

    public get min() {
        return this._min;
    }

    public get max() {
        return this._max;
    }

    public expandByPoint(point: vec3) {
        vec3.min(this._min, this._min, point);
        vec3.max(this._max, this._max, point);
        return this;
    }

    public expandByPositions(positions: vec3[]) {
        for (let i = 0; i < positions.length; i++) {
            this.expandByPoint(positions[i]);
        }
        return this;
    }

    public union(bbox: BoundingBox) {
        vec3.min(this._min, this._min, bbox._min);
        vec3.max(this._max, this._max, bbox._max);
        return this;
    }

    public applyMatrix4(matrix: mat4) {
        const corners = this.getCorners();
        this.makeEmpty();

        corners.forEach(corner => {
            vec3.transformMat4(corner, corner, matrix);
            this.expandByPoint(corner);
        });

        return this;
    }

    public getCorners() {
        const { _min, _max } = this;
        return [
            [_min[0], _min[1], _min[2]],
            [_max[0], _min[1], _min[2]],
            [_min[0], _max[1], _min[2]],
            [_max[0], _max[1], _min[2]],
            [_min[0], _min[1], _max[2]],
            [_max[0], _min[1], _max[2]],
            [_min[0], _max[1], _max[2]],
            [_max[0], _max[1], _max[2]]
        ];
    }

    public getCenter(target = [0, 0, 0]) {
        return vec3.scale(target, vec3.add(target, this._min, this._max), 0.5);
    }

    public getSize(target = [0, 0, 0]) {
        return vec3.sub(target, this._max, this._min);
    }

    public getVolume() {
        const size = this.getSize();
        return size[0] * size[1] * size[2];
    }

    public isEmpty() {
        return (
            this._min[0] === Infinity ||
            this._min[1] === Infinity ||
            this._min[2] === Infinity ||
            this._max[0] === -Infinity ||
            this._max[1] === -Infinity ||
            this._max[2] === -Infinity
        );
    }

    public makeEmpty() {
        vec3.set(this._min, Infinity, Infinity, Infinity);
        vec3.set(this._max, -Infinity, -Infinity, -Infinity);
        return this;
    }

    public clone() {
        return new BoundingBox(this._min, this._max);
    }
}
