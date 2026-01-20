import { addComponent, addEntity } from "bitecs";
import { creaetDefaultLightComponent, creaetDefaultTransformComponent, EN_LIGHT_TYPE, getPrimaryCamera, invalid_id, scene } from "./renderer";
import { vec3 } from "gl-matrix";

export class Lights {
    private _directionalLightEntity = invalid_id;

    public constructor() {
        const { lights, transforms } = scene.components;
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
        lights[directionalLightEntity].color = vec3.fromValues(255 / 255, 98 / 255, 34/255);
        lights[directionalLightEntity].intensity = 35;

        addComponent(scene, directionalLightEntity, transforms);
        transforms[directionalLightEntity] = creaetDefaultTransformComponent();
        transforms[directionalLightEntity].translation = vec3.fromValues(10000, 0, 6000);

        this._directionalLightEntity = directionalLightEntity;
    }

    public update() {
        if (this._directionalLightEntity === invalid_id) {
            return;
        }
        const { transforms } = scene.components;
        const primaryCameraEntity = getPrimaryCamera();
        const cameraCenter = transforms[primaryCameraEntity].translation;

        vec3.copy(transforms[this._directionalLightEntity].translation, cameraCenter);
        transforms[primaryCameraEntity].dirty = true;
    }
}
