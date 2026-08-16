import { addComponent, addEntity } from "bitecs";
import {
    creaetDefaultLightComponent, creaetDefaultTransformComponent, createDefaultCameraComponent,
    EN_CAMERA_TYPE, EN_LIGHT_TYPE, getPrimaryCamera, invalid_id, scene
} from "@eric-schecter/renderer";
import { mat3, mat4, quat, vec3 } from "gl-matrix";

export class Lights {
    private readonly _directionalLightEntity: number = invalid_id;

    private readonly _offset = vec3.create();

    public constructor() {
        const { lights, transforms, cameras } = scene.components;
        const ambientLightEntity = addEntity(scene);
        addComponent(scene, ambientLightEntity, lights);
        lights[ambientLightEntity] = creaetDefaultLightComponent();
        lights[ambientLightEntity].type = EN_LIGHT_TYPE.AMBIENT;
        lights[ambientLightEntity].color = vec3.fromValues(15 / 255, 110 / 255, 1);
        lights[ambientLightEntity].intensity = 6;

        const directionalLightEntity = addEntity(scene);
        addComponent(scene, directionalLightEntity, lights);
        lights[directionalLightEntity] = creaetDefaultLightComponent();
        lights[directionalLightEntity].type = EN_LIGHT_TYPE.DIRECTIONAL;
        lights[directionalLightEntity].color = vec3.fromValues(1, 98 / 255, 34 / 255);
        lights[directionalLightEntity].intensity = 35;

        const shadowCameraEntity = addEntity(scene);
        addComponent(scene, shadowCameraEntity, cameras);
        cameras[shadowCameraEntity] = createDefaultCameraComponent();
        cameras[shadowCameraEntity].near = 1;
        cameras[shadowCameraEntity].far = 50000;
        cameras[shadowCameraEntity].type = EN_CAMERA_TYPE.ORTHOGRAPHICS;

        lights[directionalLightEntity].cameras.push(shadowCameraEntity);

        addComponent(scene, directionalLightEntity, transforms);
        this._offset = vec3.fromValues(10000, 0, 6000);
        this._offset[1] = Math.sqrt(
            Math.pow(this._offset[0], 2) +
            Math.pow(this._offset[2], 2)) / 1.35;
        transforms[directionalLightEntity] = creaetDefaultTransformComponent();
        vec3.copy(transforms[directionalLightEntity].translation, this._offset);
        const m4 = mat4.lookAt(mat4.create(), transforms[directionalLightEntity].translation, vec3.create(), vec3.fromValues(0, 1, 0));
        mat4.transpose(m4, m4);
        const m3 = mat3.fromMat4(mat3.create(), m4);
        quat.fromMat3(transforms[directionalLightEntity].rotation, m3);
        console.log(transforms[directionalLightEntity].rotation,1113);

        this._directionalLightEntity = directionalLightEntity;
    }

    public update() {
        if (this._directionalLightEntity === invalid_id) {
            return;
        }
        const { transforms, lights } = scene.components;
        const primaryCameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[primaryCameraEntity].translation;

        vec3.copy(transforms[this._directionalLightEntity].translation, vec3.add(vec3.create(), cameraCenter, this._offset));
        transforms[primaryCameraEntity].dirty = true;
        lights[this._directionalLightEntity].dirty = true;
    }
}
