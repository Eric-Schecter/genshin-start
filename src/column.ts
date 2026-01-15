import { MashList } from "./datas";
import { getEntityByTag, invalid_id, scene } from "./renderer";

export class Column {
    public constructor() {

    }

    public onload() {
        for (let i = 0; i < MashList.length; i++) {
            const { Object, Scale, Location, Rotation } = MashList[i];
            const entity = getEntityByTag(Object);
            if (entity === invalid_id) {
                console.error(`can not find model:${Object}`);
                continue;
            }
            else {
                const { transforms } = scene.components;
                const transformComponent = transforms[entity];
                transformComponent.scale = Scale;
                transformComponent.translation = Location;
                transformComponent.rotation = Rotation;
                transformComponent.dirty = true;
                console.log(111)
            }
        }
    }
}
