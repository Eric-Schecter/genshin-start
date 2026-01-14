import { GraphicsDevice } from "@eric-schecter/graphics";
import { SceneRenderer } from "./renderer";
import { Road } from "./road";
import { scene } from "./renderer";
import { BoundingBox } from "./renderer";
import { query } from "bitecs";
import { vec3 } from "gl-matrix";
import { ForwardController } from "./forward_controller";

export class Game extends SceneRenderer {
    private _road: Road;

    public constructor(graphicsDevice: GraphicsDevice) {
        super(graphicsDevice);

        this._controller = new ForwardController();

        this._road = new Road();

        Promise.all([
            // this._modelLoader.load('models/DOOR.glb'),
            // this._modelLoader.load('models/SM_BigCloud.glb'),
            // this._modelLoader.load('models/SM_Light.glb'),
            // this._modelLoader.load('models/SM_Qiao01.glb'),
            // this._modelLoader.load('models/SM_Qiao02.glb'),
            // this._modelLoader.load('models/SM_Qiao03.glb'),
            // this._modelLoader.load('models/SM_Qiao04.glb'),
            this._modelLoader.load('models/SM_Road.glb'),
            // this._modelLoader.load('models/SM_ZhuZi01.glb'),
            // this._modelLoader.load('models/SM_ZhuZi02.glb'),
            // this._modelLoader.load('models/SM_ZhuZi03.glb'),
            // this._modelLoader.load('models/SM_ZhuZi04.glb'),
            // this._modelLoader.load('models/WHITE_PLANE.glb'),
        ]).then(() => {
            this._road.onLoad();
            // this._resetCamera();
        });
    }

    public update(dt: number) {
        this._controller.update(dt);
        this._road.update(dt);

        super.update(dt);
    }

    private _resetCamera() {
        const { meshes } = scene.components;
        const bbox = new BoundingBox();
        for (const entity of query(scene, [meshes])) {
            const meshComponent = meshes[entity];
            bbox.union(meshComponent.bbox);
        }
        const { max, min } = bbox;
        const y = max[1] - min[1];
        this._controller.pos = vec3.fromValues(0, min[1] + y, 40000);
        this._controller.focus = vec3.fromValues(0, min[1] + y, 0);
    }
}
