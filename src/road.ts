import { mat4, vec3, vec4 } from "gl-matrix";
import { clone, getEntityByTag, getPrimaryCamera, invalid_id, scene } from "@eric-schecter/renderer";
import { query } from "bitecs";
import { Tween, Easing } from '@tweenjs/tween.js';
import Color from "color";

export class Road {
    private _zLength = 212.4027;
    private _offset = vec3.fromValues(0, 34, 200);
    private _extendNum = 1;
    private RoadUnitLength = 0;
    private hasStartGame = false;
    // private obj!: Object3D
    private _shouldStop: boolean = false;
    private doorHasCreate: boolean = false;
    private shouldOpenDoor: boolean = false;
    private _originPosList: vec3[] = [];
    private _children: number[] = [];

    // private mixerList: AnimationMixer[] = [];

    private _animations: Tween[] = [];

    onLoad(): void {
        const smRoadEntity = getEntityByTag('SM_Road');
        if (smRoadEntity === invalid_id) {
            console.error('cannot find sm road');
            return;
        }

        const { hierarchies, transforms, objects, meshes, materials } = scene.components;
        const baseColor = vec4.fromValues(1, 252 / 255, 254 / 255, 1);

        for (const entity of query(scene, [hierarchies, transforms])) {
            const hierarchy = hierarchies[entity];
            if (hierarchy.parent === smRoadEntity) {
                const transform = transforms[entity];

                vec3.scale(transform.scale, transform.scale, 0.1);
                vec3.scale(transform.translation, transform.translation, 0.1);

                vec3.sub(transform.translation, transform.translation, this._offset);

                transform.dirty = true;

                this._children.push(entity);

                const meshEntities = objects[entity].meshEntities;
                for (const meshEntity of meshEntities) {
                    const [materialEntity] = meshes[meshEntity].materialEntity;
                    const material = materials[materialEntity];
                    material.baseColorFactor = baseColor;
                    material.roughnessFactor = 5;
                    material.metallicFactor = 0;
                    material.dirty = true;
                }
            }
        }

        this.RoadUnitLength = this._children.length;

        for (let i = 0; i < this._extendNum; i++) {
            for (let j = 0; j < this.RoadUnitLength; j++) {
                const cloneEntity = clone(this._children[j]);
                const transformComponent = transforms[cloneEntity];
                vec3.add(transformComponent.translation, transformComponent.translation, vec3.fromValues(0, 0, -this._zLength * (1 + i)));
                this._children.push(cloneEntity);
            }
        }

        this._zLength *= 1 + this._extendNum;
        for (let i = 0; i < this._children.length; i++) {
            const transform = transforms[this._children[i]];
            this._originPosList.push(vec3.clone(transform.translation));
        }

        // this.on("start", this._startGame, this, true)
    }
    update(dt: number): void {
        if (!this._shouldStop) {
            const cameraEntity = getPrimaryCamera();
            const { transforms } = scene.components;
            const cameraCenter = transforms[cameraEntity].translation;

            for (let i = 0; i < this._children.length; i++) {
                const childEntity = this._children[i];
                const transformComponent = transforms[childEntity];
                // const worldPos = mat4.getTranslation(vec3.create(), transformComponent.worldMatrix); // todo: has bug
                const childPosition = transformComponent.translation;
                if (childPosition[2] > cameraCenter[2]) {
                    if (i % this.RoadUnitLength == 0 && this.hasStartGame) {
                        this._shouldStop = true;
                        // this._showDoor(childPosition[2]);
                        // gameManager.emit("showDoor", childPosition[2]);
                    }
                    vec3.sub(childPosition, childPosition, vec3.fromValues(0, 0, this._zLength));
                    vec3.sub(this._originPosList[i], this._originPosList[i], vec3.fromValues(0, 0, this._zLength));
                    const originalPos = vec3.clone(this._originPosList[i]);
                    vec3.add(childPosition, childPosition, vec3.fromValues(0, -70, 0));
                    if (this._animations[i]) {
                        this._animations[i].stop();
                    }
                    const tween = new Tween(childPosition)
                        .to(originalPos, 2000)
                        .easing(Easing.Back.Out)
                        .onUpdate(() => {
                            transformComponent.dirty = true;
                        })
                        .start(performance.now());
                    this._animations[i] = tween;

                    transformComponent.dirty = true;
                }
            }
        }

        this._animations.forEach(animation => {
            animation.update(performance.now())
        });

        // for (let mix of this.mixerList) {
        //     if (mix.time + dt > 1.4583333333333333) {
        //         if (!this.doorHasCreate) {
        //             // gameManager.emit("doorCreate")
        //             // this._creatBackground();
        //         }
        //         if (this.shouldOpenDoor && mix.time + dt * 1.6 < mix.timeScale * mix["_actions"][0]["_clip"].duration) {
        //             mix.update(dt * 1.6)
        //         }
        //     }
        //     else {
        //         mix.update(dt);
        //     }
        // }

        // if (this.obj && !this.shouldStop) {
        //     for (let i = 0; i < this.obj.children.length; i++) {

        //         if (this.obj.children[i].position.z > cameraCenter.z) {
        //             if (i % this.RoadUnitLength == 0 && this.hasStartGame) {
        //                 this.shouldStop = true;
        //                 this._showDoor(this.obj.children[i].position.z);
        //                 gameManager.emit("showDoor", this.obj.children[i].position.z);
        //             }
        //             this.obj.children[i].position.sub(new Vector3(0, 0, this.zLength))
        //             this.originPosList[i].sub(new Vector3(0, 0, this.zLength))
        //             let originalPos = this.originPosList[i].clone()
        //             this.obj.children[i].position.add(new Vector3(0, -70, 0))
        //             TWEEN.TweenManager.KillTweensOf(this.obj.children[i]);
        //             TWEEN.TweenManager.Tween(this.obj.children[i])
        //                 .to({ position: originalPos }, 2)
        //                 .easing(TWEEN.Easing.Back.Out)
        //                 .start();
        //         }
        //     }
        // }
        // for (let mix of this.mixerList) {
        //     if (mix.time + dt > 1.4583333333333333) {
        //         if (!this.doorHasCreate) {
        //             gameManager.emit("doorCreate")
        //             this._creatBackground();
        //         }
        //         if (this.shouldOpenDoor && mix.time + dt * 1.6 < mix.timeScale * mix["_actions"][0]["_clip"].duration) {
        //             mix.update(dt * 1.6)
        //         }
        //     }
        //     else {
        //         mix.update(dt);
        //     }
        // }
    }

    private _startGame() {
        this.hasStartGame = true;
    }

    // private _showDoor(zOffset) {
    //     this.viewer.load({ url: "Genshin/Login/DOOR.glb" }).then((v) => {
    //         gameManager.emit("doorCreateBegin")

    //         v.traverse((mesh: any) => {
    //             if (mesh instanceof Mesh) {
    //                 mesh.castShadow = true
    //                 mesh.receiveShadow = true
    //                 mesh.material = toonMaterials.getToonMaterial_Door(mesh.material, this.viewer.renderer)
    //             }
    //         })
    //         v.scale.set(0.1, 0.1, 0.04);

    //         for (let clip of v.animations) {
    //             const mixer = new AnimationMixer(v);
    //             mixer.clipAction(clip).setLoop(LoopOnce, 1);
    //             mixer.clipAction(clip).play();
    //             this.mixerList.push(mixer);
    //         }
    //         this.offset.set(0, -this.offset.y, zOffset - this.extendNum * this.zLength - 14);
    //         v.position.copy(this.offset)
    //     })
    // }

    // private hasLoadBackground = false
    // private _creatBackground() {
    //     if (!this.hasLoadBackground) {
    //         this.viewer.load({ url: "Genshin/Login/WHITE_PLANE.glb" }).then((v) => {
    //             v.scale.set(0.1, 0.1, 0.1);
    //             v.traverse((mesh: any) => {
    //                 if (mesh instanceof Mesh) {
    //                     mesh.material.color = new Color("#ffffff").multiplyScalar(3)
    //                 }
    //             })
    //             v.position.copy(this.offset);
    //             this.doorHasCreate = true;
    //         })
    //         this.hasLoadBackground = true
    //     }
    // }

    public openDoor() {
        this.shouldOpenDoor = true;
    }
}
