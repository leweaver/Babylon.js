module BABYLON {

    declare var Promise: any;
    export class WindowsMotionController extends WebVRController {

        //public static readonly MODEL_BASE_URL = 'https://iescratch-web/Users/webvr/gltf/controllers/wmr/';
        public static readonly MODEL_BASE_URL = '/assets/meshes/controllers/wmr/';
        public static readonly MODEL_LEFT_FILENAME = 'left.glb';
        public static readonly MODEL_RIGHT_FILENAME = 'right.glb';
        public static readonly GAMEPAD_ID_PREFIX = 'Spatial Controller (Spatial Interaction Source)';
        public static readonly ROOT_NODE_NAME = 'RootNode';
        public static readonly MAX_TRIES = 1;

        private _parentMeshName: string;
        private _loadedMeshInfo: LoadedMeshInfo;
        private readonly _mapping : IControllerMappingInfo = {
            axes: {'thumbstick': [0, 1], 'surface': [2, 3]},
            // Semantic button names
            buttons: ['thumbstick', 'trigger', 'grip', 'menu', 'trackpad'],
            // A mapping of the semantic name to button node name in the glTF model file,
            // that should be transformed by button value.
            buttonMeshNames: {
                'trigger': 'SELECT',
                'menu': 'MENU',
                'grip': 'GRASP',
                'thumbstick': 'THUMBSTICK_PRESS',
                'trackpad': 'TOUCHPAD_PRESS'
            },
            // A mapping of the semantic name to node name in the glTF model file,
            // that should be transformed by axis value.
            axisMeshNames: {
                'thumbstick_0': 'THUMBSTICK_X',
                'thumbstick_1': 'THUMBSTICK_Y',
                'surface_2': 'TOUCHPAD_TOUCH_X',
                'surface_3': 'TOUCHPAD_TOUCH_Y'
            }
        };

        public onSecondaryTriggerStateChangedObservable = new Observable<ExtendedGamepadButton>();

        public onTrackpadChangedObservable = new Observable<ExtendedGamepadButton>();

        constructor(vrGamepad) {
            super(vrGamepad);
            this.controllerType = PoseEnabledControllerType.WINDOWS;            
            this._parentMeshName = this.id + " " + this.hand;
        }

        public initControllerMesh(scene: Scene, meshLoaded?: (mesh: AbstractMesh) => void) {

            let parentMesh = scene.getMeshByName(this._parentMeshName);
            if (parentMesh) {
                if (!this._loadedMeshInfo) {
                    this._loadedMeshInfo = this.createMeshInfo(parentMesh);
                    if (meshLoaded) meshLoaded(this._loadedMeshInfo.rootNode);

                    this.attachToMesh(this._loadedMeshInfo.rootNode);
                }
            } else {
                this.loadMesh(scene).then(meshLoaded);
            }
        }

        protected loadMesh(scene: Scene, attempt?:number) : Promise<AbstractMesh> {
            attempt = attempt || 0;
            var useDefaultMesh = attempt >= WindowsMotionController.MAX_TRIES;
            var controllerSrc = this.createControllerModelUrl(useDefaultMesh);

            var pms : Promise<AbstractMesh>;
            
            pms = new Promise((resolve, reject) => {  
                SceneLoader.ImportMesh("", controllerSrc.path, controllerSrc.name, scene, 
                    (meshes: AbstractMesh[]) => {
                        this.onModelLoadComplete(scene, meshes);                        
                        resolve(this._loadedMeshInfo.rootNode);
                    }, 
                    null, 
                    (scene: Scene, message: string, exception?: any) => {
                        if (useDefaultMesh) 
                            reject(message);
                        else
                            this.loadMesh(scene, attempt + 1).then(resolve, reject);
                    });
            });

            return pms;
        }

        protected onModelLoadComplete(scene: Scene, meshes: AbstractMesh[]) {

            // Find the first mesh in the loaded glTF scene, and attach it as a child of 'parentMesh'
            let parentMesh = new BABYLON.Mesh(this._parentMeshName, scene);
            let childMesh : AbstractMesh = null;
            meshes.forEach(mesh => {
                if (mesh.id === WindowsMotionController.ROOT_NODE_NAME) {
                    // There may be a parent mesh to perform the RH to LH matrix transform.
                    if (mesh.parent && mesh.parent.name === "root")
                        mesh = <AbstractMesh>mesh.parent;
                    
                    childMesh = childMesh || mesh;
                    childMesh.setParent(parentMesh);
                }
            });

            this._loadedMeshInfo = this.createMeshInfo(parentMesh);
            this.attachToMesh(this._loadedMeshInfo.rootNode);
        }

        private createControllerModelUrl(forceDefault) : IControllerUrl {
            // Get the vendor folder
            var vidpid = 'default';

            if (!forceDefault) {
                if (this.id) {
                    var match = this.id.match(/([0-9a-zA-Z]+-[0-9a-zA-Z]+)$/);
                    vidpid = ((match && match[0]) || vidpid);
                }
            }

            // Hand
            var filename = this.hand === 'left' ? WindowsMotionController.MODEL_LEFT_FILENAME : WindowsMotionController.MODEL_RIGHT_FILENAME;

            // Final url
            return {
                path: WindowsMotionController.MODEL_BASE_URL + vidpid + '/',
                name: filename
            };
        }

        public get onTriggerButtonStateChangedObservable() {
            return this.onTriggerStateChangedObservable;
        }

        public get onMenuButtonStateChangedObservable() {
            return this.onSecondaryButtonStateChangedObservable;
        }

        public get onGripButtonStateChangedObservable() {
            return this.onMainButtonStateChangedObservable;
        }

        public get onThumbstickButtonStateChangedObservable() {
            return this.onPadStateChangedObservable;
        }    

        public get onTouchpadButtonStateChangedObservable() {
            return this.onTrackpadChangedObservable;
        }
        
        private createMeshInfo(rootNode: AbstractMesh) : LoadedMeshInfo {
            var valueChild : AbstractMesh;
            if (!rootNode) {
                // TODO: Log warning
                return null;
            }

            let loadedMeshInfo = new LoadedMeshInfo();
            loadedMeshInfo.rootNode = rootNode;
/*
            // Button Meshes
            loadedMeshInfo.buttonMeshes = {};
            for (var i = 0; i < this._mapping.buttons.length; i++) {
                var meshName = this._mapping.buttonMeshNames[this._mapping.buttons[i]];
                if (!meshName) continue;

                var buttonMesh = rootNode.getObjectByName(meshName);
                if (!buttonMesh) continue;

                valueChild = getImmediateChildByName(buttonMesh, 'VALUE');
                if (valueChild) {
                    loadedMeshInfo.buttonMeshes[this._mapping.buttons[i]] = {
                        index: i,
                        mesh: valueChild.getObjectByProperty('type', 'Mesh'),
                        value: valueChild,
                        pressed: getImmediateChildByName(buttonMesh, 'PRESSED'),
                        unpressed: getImmediateChildByName(buttonMesh, 'UNPRESSED')
                    };
                }
            }

            // Axis Meshes
            loadedMeshInfo.axisMeshes = {};
            for (var axisGroupName in this._mapping.axes) {
                var axisGroup = this._mapping.axes[axisGroupName];
                var axis : number;
                for (axis of axisGroup) {
                    var axisName = axisGroupName + '_' + axis;

                    var axisMeshName = this._mapping.axisMeshNames[axisName];
                    if (!axisMeshName) continue;

                    var axisMesh = rootNode.getObjectByName(axisMeshName);
                    if (!axisMesh) continue;

                    valueChild = getImmediateChildByName(axisMesh, 'VALUE');
                    if (valueChild) {
                        loadedMeshInfo.axisMeshes[axisName] = {
                            index: axis,
                            mesh: valueChild.getObjectByProperty('type', 'Mesh'),
                            value: valueChild,
                            min: getImmediateChildByName(axisMesh, 'MIN'),
                            max: getImmediateChildByName(axisMesh, 'MAX')
                        };
                    }
                }
            }
*/
            return loadedMeshInfo;
            
            // This will return null if no mesh exists with the given name.
            function getImmediateChildByName (node, name) : AbstractMesh {
                return node.getChildMeshes(true, n => n.name == name)[0];
            }
            function getChildWithMesh (node) : AbstractMesh {
                return node.getChildMeshes(true, n => n.name == name)[0];
            }
        }
        
        protected lerpButtonTransform(node: AbstractMesh, childName: string, value: number) {
            let minMesh = node.getChildMeshes(true, n => n.name == 'MIN')[0];
            let maxMesh = node.getChildMeshes(true, n => n.name == 'MAX')[0];
            if (minMesh && maxMesh) {     
                let valueMesh = node.getChildMeshes(true, n => n.name == 'VALUE')[0] || node;
                valueMesh.rotationQuaternion = BABYLON.Quaternion.Slerp(minMesh.rotationQuaternion, maxMesh.rotationQuaternion, value);
            }
        }

        /*
        // This is the old, broken mapping.
        0) trigger, 
        1) menu
        2) grip
        3) thumb
        4) touch
        */
        protected handleButtonChange(buttonIdx: number, state: ExtendedGamepadButton, changes: GamepadButtonChanges) {
            let notifyObject = state; //{ state: state, changes: changes };
            let triggerDirection = this.hand === 'right' ? -1 : 1;
            console.log('Button Change: ' + buttonIdx);
            switch (buttonIdx) {
                case 0: // index trigger
                    //if (this._loadedMeshInfo.rootNote) {
                    //    this.lerpButtonTransform(<AbstractMesh>this._loadedMeshInfo.rootNote.getChildren()[0], 'SELECT', notifyObject.value);
                    //}
                    this.onTriggerStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 1:
                    //if (this._loadedMeshInfo.rootNote) {
                    //    if (notifyObject.pressed) {
                    //        (<AbstractMesh>(this._loadedMeshInfo.rootNote.getChildren()[1])).position.y = -0.001;
                    //    }
                    //    else {
                    //        (<AbstractMesh>(this._loadedMeshInfo.rootNote.getChildren()[1])).position.y = 0;
                    //    }
                    //}
                    this.onMainButtonStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 2:  // secondary trigger
                    //if (this._loadedMeshInfo.rootNote) {
                    //    (<AbstractMesh>(this._loadedMeshInfo.rootNote.getChildren()[4])).position.x = triggerDirection * notifyObject.value * 0.0035;
                    //}
                    this.onSecondaryTriggerStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 3:
                    this.onPadStateChangedObservable.notifyObservers(notifyObject);
                    return;
                case 4:
                    this.onTrackpadChangedObservable.notifyObservers(notifyObject);
                    return;
            }
        }
    }

    class LoadedMeshInfo {
        public rootNode: AbstractMesh;
        public buttonMeshes: { [id: string] : IButtonMeshInfo; } = {};
        public axisMeshes: { [id: string] : IAxisMeshInfo; } = {};
    }

    interface IMeshInfo {
        index: number;
        mesh: AbstractMesh;
        value: AbstractMesh;
    }

    interface IButtonMeshInfo extends IMeshInfo {
        pressed: AbstractMesh;
        unpressed: AbstractMesh;
    }

    interface IAxisMeshInfo extends IMeshInfo {
        min: AbstractMesh;
        max: AbstractMesh;
    }

    interface IControllerMappingInfo {
        axes: { [id: string] : number[] };
        buttons: string[];
        buttonMeshNames: { [id: string ] : string };
        axisMeshNames: { [id: string ] : string };
    }

    interface IControllerUrl {
        path: string;
        name: string;
    }
}


/*
RootNode
    Controller
    HOME
        PRESSED
        UNPRESSED
        VALUE
            CrystalKey_6DOF_Home_Geo
    MENU
        PRESSED
        UNPRESSED
        VALUE
    GRASP
        PRESSED
        UNPRESSED
        VALUE
            CrystalKey_6DOF_Grip_Geo
    THUMBSTICK_PRESS
        PRESSED
        UNPRESSED
        VALUE
            THUMBSTICK_X
                MIN
                MAX
                VALUE
                    THUMBSTICK_Y
                        MIN
                        MAX
                        VALUE
    SELECT
        PRESSED
        UNPRESSED
        VALUE
    CrystalKey_6DOF_Constellation
        CrystalKey_6DOF_Constellation_Flip
            CrystalKey_6DOF_Constellation_Rotate
    TOUCHPAD_PRESS
        PRESSED
        UNPRESSED
            VALUE
                TOUCHPAD_PRESS_X
                    VALUE
                        TOUCHPAD_PRESS_Y
                            VALUE
                                TOUCHPAD_TOUCH_X
                                    MIN
                                    MAX
                                    VALUE
                                        TOUCHPAD_TOUCH_Y
                                            MIN
                                            MAX
                                            VALUE
                                                TOUCH
                            MIN
                            MAX
                    MIN
                    MAX
    CrystalKey_6DOF_Body_Geo
    CrystalKey_6DOF_Pointing_Pose
    CrystalKey_6DOF_LED_Tracking_CSYS
    CrystalKey_6DOF_Holding_Pose
*/
    