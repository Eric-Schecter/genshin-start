import { vec3 } from "gl-matrix";
import { clone, getEntityByTag, getPrimaryCamera, invalid_id, scene } from "./renderer/ecs";
import { query } from "bitecs";
import * as TWEEN from '@tweenjs/tween.js';

export class Road {
    private _zLength = 212.4027;
    private _offset = vec3.fromValues(0, 34, 200);
    private extendNum = 1;//扩展出的长度
    private RoadUnitLength = 0;
    private hasStartGame = false;
    // private obj!: Object3D
    private shouldStop: boolean = false;
    private doorHasCreate: boolean = false;
    private shouldOpenDoor: boolean = false;
    private _originPosList: vec3[] = [];
    private _children: number[] = [];

    // private mixerList: AnimationMixer[] = [];

    onLoad(): void {
        const smRoadEntity = getEntityByTag('SM_Road');
        if (smRoadEntity === invalid_id) {
            console.error('cannot find sm road');
        }

        const { hierarchies, transforms } = scene.components;
        for (const entity of query(scene, [hierarchies, transforms])) {
            const hierarchy = hierarchies[entity];
            if (hierarchy.parent === smRoadEntity) {
                const transform = transforms[entity];
                vec3.scale(transform.scale, transform.scale, 0.1);
                vec3.scale(transform.translation, transform.translation, 0.1);
                vec3.sub(transform.translation, transform.translation, this._offset);

                transform.dirty = true;

                this._children.push(entity);
            }
        }

        this.RoadUnitLength = this._children.length;

        for (let i = 0; i < this.extendNum; i++) {
            for (let j = 0; j < this.RoadUnitLength; j++) {
                let cloneEntity = clone(this._children[j]);
                const transformComponent = transforms[cloneEntity];
                vec3.add(transformComponent.translation, transformComponent.translation, vec3.fromValues(0, 0, -this._zLength * (1 + i)));
            }
        }

        this._zLength *= 1 + this.extendNum;
        for (let i = 0; i < this._children.length; i++) {
            const transform = transforms[this._children[i]];
            this._originPosList.push(vec3.clone(transform.translation));
        }

        // const v = this.viewer.user.resources.SM_Road
        // this.viewer.scene.add(v)
        // v.traverse((mesh: any) => {
        //     mesh.receiveShadow = true
        //     if (mesh instanceof Mesh) {
        //         mesh.material = toonMaterials.getToonMaterial_Road(mesh.material, this.viewer.renderer)
        //         mesh.receiveShadow = true
        //     }
        // })

        // for (let i of v.children) {
        //     i.scale.multiplyScalar(0.1)
        //     i.position.multiplyScalar(0.1)
        //     i.position.sub(this.offset)
        // }
        // let n = v.children.length
        // this.RoadUnitLength = n;
        // for (let i = 0; i < this.extendNum; i++) {
        //     for (let j = 0; j < n; j++) {
        //         let clone = this.cloneObject3D(v.children[j]);
        //         clone.position.add(new Vector3(0, 0, -this.zLength * (1 + i)))
        //         v.add(clone)
        //     }
        // }
        // this.zLength *= 1 + this.extendNum
        // this.obj = v
        // for (let i = 0; i < this.obj.children.length; i++) {
        //     this.originPosList.push(this.obj.children[i].position.clone())
        // }
        // this.on("start", this._startGame, this, true)
    }
    update(dt: number): void {
        if (!this.shouldStop) {
            const cameraEntity = getPrimaryCamera();
            const { transforms } = scene.components;
            const cameraCenter = transforms[cameraEntity].translation;
            for (let i = 0; i < this._children.length; i++) {
                const childEntity = this._children[i];
                const childPosition = transforms[childEntity].translation;
                if (childPosition[2] > cameraCenter[2]) {
                    if (i % this.RoadUnitLength == 0 && this.hasStartGame) {
                        this.shouldStop = true;
                        // this._showDoor(childPosition[2]);
                        // gameManager.emit("showDoor", childPosition[2]);
                    }
                    // vec3.sub(childPosition, childPosition, vec3.fromValues(0, 0, this._zLength));
                    // vec3.sub(this._originPosList[i], this._originPosList[i], vec3.fromValues(0, 0, this._zLength));
                    // const originalPos = vec3.clone(this._originPosList[i]);
                    // vec3.add(childPosition, childPosition, vec3.fromValues(0, -70, 0));
                    // TWEEN.TweenManager.KillTweensOf(this._children[i]);
                    // TWEEN.TweenManager.Tween(this._children[i])
                    //     .to({ position: originalPos }, 2)
                    //     .easing(TWEEN.Easing.Back.Out)
                    //     .start();

                }
            }
        }

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
