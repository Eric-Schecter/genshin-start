import { quat, vec3 } from "gl-matrix";
import { MashList } from "./datas";
import { clone, getEntityByTag, getPrimaryCamera, invalid_id, scene } from "./renderer";
import { query } from "bitecs";

export class Column {
    private _prefab = new Map<string, number>(); // not real prefab

    private _markedObj = new Set<string>();

    private _zLength = 20600;

    public onload() {
        for (let i = 0; i < MashList.length; i++) {
            const { Object } = MashList[i];
            const entity = getEntityByTag(Object);
            if (!this._prefab.has(Object)) {
                this._prefab.set(Object, entity);
            }
        }
        for (let i = 0; i < MashList.length; i++) {
            const { Object, Scale, Location, Rotation } = MashList[i];
            const entity = this._prefab.get(Object);
            if (!entity || entity === invalid_id) {
                console.error(`can not find model:${Object}`);
                continue;
            }
            else {
                const clonedEntity = this._markedObj.has(Object) ? clone(entity) : entity;
                const { transforms } = scene.components;
                const transformComponent = transforms[clonedEntity];
                transformComponent.scale = vec3.scale(vec3.create(), vec3.fromValues(Scale[0], Scale[2], Scale[1]), 0.1);
                transformComponent.translation = vec3.scale(vec3.create(),vec3.fromValues(Location[0], Location[2], -Location[1]),1);
                transformComponent.rotation = quat.fromEuler(quat.create(), Rotation[0], Rotation[2], Rotation[1]);
                transformComponent.dirty = true;
                this._markedObj.add(Object);
            }
        }
    }

    public update(dt: number) {
        const { tags, transforms } = scene.components;
        const cameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[cameraEntity].translation;
        for (const entity of query(scene, [tags, transforms])) {
            if (this._markedObj.has(tags[entity].tag) &&
                transforms[entity].translation[2] > cameraCenter[2] + 2000) {
                transforms[entity].translation[2] -= this._zLength * 10;
                transforms[entity].dirty = true;
            }
        }
    }
}
