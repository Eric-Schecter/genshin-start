import { GraphicsDevice } from "@eric-schecter/graphics";
import { quat, vec3 } from "gl-matrix";
import { FirstPersonController, getPrimaryCamera, SceneRenderer, scene } from "./renderer";
import { Road } from "./road";
import { ForwardController } from "./forward_controller";
import { Column } from "./column";
import { BackGround } from "./background";
import { Cloud } from "./cloud";
import { BigCloud } from "./big_cloud";
import { Fog } from "./fog";
import { Lights } from "./lights";
import { PolarLight } from "./polar_light";

export class Game extends SceneRenderer {
    private _road: Road;

    private _column: Column;

    private _background: BackGround;

    private _cloud: Cloud;

    private _bigCloud: BigCloud;

    private _fog: Fog;

    private _lights: Lights;

    private _polarLight: PolarLight;

    private _debug = false;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        const cameraEntity = getPrimaryCamera();
        const { transforms } = scene.components;
        transforms[cameraEntity].rotation = quat.rotateX(quat.create(), quat.create(), 5.5 * Math.PI / 180);
        transforms[cameraEntity].dirty = true;

        if (this._debug) {
            this._controller = new FirstPersonController(graphicsDevice.canvas);
            this._controller.pos = vec3.fromValues(0, 0, 1);
            const dir = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), this._controller.focus, this._controller.pos));
            const rotatedDir = vec3.transformQuat(vec3.create(), dir, quat.rotateX(quat.create(), quat.create(), 5.5 * Math.PI / 180));
            this._controller.focus = vec3.add(vec3.create(), this._controller.pos, rotatedDir);
        } else {
            this._controller = new ForwardController();
            // todo: simpliy this
            const dir = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), this._controller.focus, this._controller.pos));
            const rotatedDir = vec3.transformQuat(vec3.create(), dir, quat.rotateX(quat.create(), quat.create(), 5.5 * Math.PI / 180));
            this._controller.focus = vec3.add(vec3.create(), this._controller.pos, rotatedDir);
        }

        this._road = new Road();
        this._column = new Column();
        this._background = new BackGround(this._graphicsDevice);
        this._cloud = new Cloud(graphicsDevice);
        this._bigCloud = new BigCloud(graphicsDevice);
        this._fog = new Fog(graphicsDevice);
        this._lights = new Lights();
        this._polarLight = new PolarLight(graphicsDevice);

        this._renderers.push(
            this._cloud,
            this._bigCloud,
            this._fog,
            this._polarLight,
        );

        this._skyRenderer.envTexture = this._background.create();
        this._skyRenderer.isEquirectangular = false;

        this._cloud.onload();

        Promise.all([
            // this._modelLoader.load('models/DOOR.glb'),
            this._modelLoader.load('models/SM_BigCloud.glb'),
            this._modelLoader.load('models/SM_Light.glb'),
            this._modelLoader.load('models/SM_Qiao01.glb'),
            this._modelLoader.load('models/SM_Qiao02.glb'),
            this._modelLoader.load('models/SM_Qiao03.glb'),
            this._modelLoader.load('models/SM_Qiao04.glb'),
            this._modelLoader.load('models/SM_Road.glb'),
            this._modelLoader.load('models/SM_ZhuZi01.glb'),
            this._modelLoader.load('models/SM_ZhuZi02.glb'),
            this._modelLoader.load('models/SM_ZhuZi03.glb'),
            this._modelLoader.load('models/SM_ZhuZi04.glb'),
            // this._modelLoader.load('models/WHITE_PLANE.glb'),
        ]).then(() => {
            this._road.onLoad();
            this._column.onload();
            this._bigCloud.onload();
            this._polarLight.onload();
        });
    }

    public update(dt: number) {
        this._controller.update(dt);
        this._road.update(dt);
        this._column.update(dt);
        this._lights.update();

        super.update(dt);
    }
}
