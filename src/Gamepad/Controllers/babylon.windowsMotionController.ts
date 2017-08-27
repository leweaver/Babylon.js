module BABYLON {

    declare var Promise: any;
    export class WindowsMotionController extends WebVRController {

        //public static readonly MODEL_BASE_URL = 'https://iescratch-web/Users/webvr/gltf/controllers/wmr/';
        public static readonly MODEL_BASE_URL = '/assets/meshes/controllers/wmr/';
        public static readonly MODEL_LEFT_FILENAME = 'left.glb';
        public static readonly MODEL_RIGHT_FILENAME = 'right.glb';
        public static readonly GAMEPAD_ID_PREFIX = 'Spatial Controller (Spatial Interaction Source)';
        public static readonly ROOT_NODE_NAME = 'RootNode';
        // TODO: Why do we need to flip the model around? Art asset or BabylonJS specific?
        public static readonly ROTATE_OFFSET = [Math.PI, 0, 0]; // x, y, z. 
        public static readonly MAX_TRIES = 1;

        private _parentMeshName: string;
        private _loadedMeshInfo: LoadedMeshInfo;
        private readonly _mapping : IControllerMappingInfo = {
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
            // This mapping is used to translate from the Motion Controller to Babylon semantics
            buttonObservableNames: {
                'trigger': 'onTriggerStateChangedObservable',
                'menu': 'onSecondaryButtonStateChangedObservable',
                'grip': 'onMainButtonStateChangedObservable',
                'thumbstick': 'onPadStateChangedObservable',
                'trackpad': 'onTrackpadChangedObservable'
            },
            // TODO: These may need to be used to offset the rotation of the model from the pointing ray
            // TODO: Remove prefixes from the model data.
            pointingPoseMeshName: 'CrystalKey_6DOF_Pointing_Pose',
            holdingPoseMeshName: 'CrystalKey_6DOF_Holding_Pose',
            // A mapping of the semantic name to node name in the glTF model file,
            // that should be transformed by axis value.
            axisMeshNames: [
                'THUMBSTICK_X',
                'THUMBSTICK_Y',
                'TOUCHPAD_TOUCH_X',
                'TOUCHPAD_TOUCH_Y'
            ]
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
                // Disable picking
                mesh.isPickable = false;

                // Handle root node, attach to the new parentMesh
                if (mesh.id === WindowsMotionController.ROOT_NODE_NAME) {
                    // There may be a parent mesh to perform the RH to LH matrix transform.
                    if (mesh.parent && mesh.parent.name === "root")
                        mesh = <AbstractMesh>mesh.parent;
                    
                    childMesh = childMesh || mesh;
                    childMesh.setParent(parentMesh);

                }
            });

            this._loadedMeshInfo = this.createMeshInfo(parentMesh);
            if (!this._loadedMeshInfo) {
                // TODO: Log warning
                return;
            }

            // Apply rotation offsets
            var rotOffset = WindowsMotionController.ROTATE_OFFSET;
            childMesh.addRotation(rotOffset[0], rotOffset[1], rotOffset[2]);

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
            if (!rootNode) {
                // TODO: Log warning
                return null;
            }

            let loadedMeshInfo = new LoadedMeshInfo();
            loadedMeshInfo.rootNode = rootNode;

            // Button Meshes
            loadedMeshInfo.buttonMeshes = {};
            for (let i = 0; i < this._mapping.buttons.length; i++) {
                let meshName = this._mapping.buttonMeshNames[this._mapping.buttons[i]];
                if (!meshName) continue;

                let buttonMesh = rootNode.getChildMeshes(false, (m) => m.name === meshName)[0];
                if (!buttonMesh) continue;

                let buttonMeshInfo = {
                    index: i,
                    value: getImmediateChildByName(buttonMesh, 'VALUE'),
                    pressed: getImmediateChildByName(buttonMesh, 'PRESSED'),
                    unpressed: getImmediateChildByName(buttonMesh, 'UNPRESSED')
                };
                if (buttonMeshInfo.value && buttonMeshInfo.pressed && buttonMeshInfo.unpressed) {
                    loadedMeshInfo.buttonMeshes[this._mapping.buttons[i]] = buttonMeshInfo;
                }
            }

            // Axis Meshes
            loadedMeshInfo.axisMeshes = {};
            for (let axis = 0; axis < this._mapping.axisMeshNames.length; axis++) {
                var axisMeshName = this._mapping.axisMeshNames[axis];
                if (!axisMeshName) continue;

                let axisMesh = rootNode.getChildMeshes(false, (m) => m.name === axisMeshName)[0];
                if (!axisMesh) continue;

                let axisMeshInfo = {
                    index: axis,
                    value: getImmediateChildByName(axisMesh, 'VALUE'),
                    min: getImmediateChildByName(axisMesh, 'MIN'),
                    max: getImmediateChildByName(axisMesh, 'MAX')
                };
                if (axisMeshInfo.value && axisMeshInfo.min && axisMeshInfo.max) {
                    loadedMeshInfo.axisMeshes[axis] = axisMeshInfo;
                }
            }

            // Pose offsets
            loadedMeshInfo.pointingPoseNode = rootNode.getChildMeshes(false, (m) => m.name === this._mapping.pointingPoseMeshName)[0];
            loadedMeshInfo.holdingPoseNode = rootNode.getChildMeshes(false, (m) => m.name === this._mapping.holdingPoseMeshName)[0];

            return loadedMeshInfo;
            
            // This will return null if no mesh exists with the given name.
            function getImmediateChildByName (node, name) : AbstractMesh {
                return node.getChildMeshes(true, n => n.name == name)[0];
            }
        }
        
        protected lerpButtonTransform(buttonName: string, value: number) {
            
            // If there is no loaded mesh, there is nothing to transform.
            if (!this._loadedMeshInfo) return;

            var meshInfo = this._loadedMeshInfo.buttonMeshes[buttonName];
            BABYLON.Quaternion.SlerpToRef(
                meshInfo.unpressed.rotationQuaternion, 
                meshInfo.pressed.rotationQuaternion, 
                value,
                meshInfo.value.rotationQuaternion);
            BABYLON.Vector3.LerpToRef(
                meshInfo.unpressed.position, 
                meshInfo.pressed.position,
                value,
                meshInfo.value.position);
        }
        
        protected lerpAxisTransform(axis, axisValue: number) {
            
            // If there is no loaded mesh, there is nothing to transform.
            if (!this._loadedMeshInfo) return;
      

            let meshInfo = this._loadedMeshInfo.axisMeshes[axis];
            if (!meshInfo) return;

            let value = axisValue * 0.5 + 0.5;
            BABYLON.Quaternion.SlerpToRef(
                meshInfo.min.rotationQuaternion, 
                meshInfo.max.rotationQuaternion, 
                value,
                meshInfo.value.rotationQuaternion);
            BABYLON.Vector3.LerpToRef(
                meshInfo.min.position, 
                meshInfo.max.position,
                value,
                meshInfo.value.position);
        }

        protected handleButtonChange(buttonIdx: number, state: ExtendedGamepadButton, changes: GamepadButtonChanges) {
            let buttonName = this._mapping.buttons[buttonIdx];
            if (!buttonName) return; // TODO: Log warning
            
            this.lerpButtonTransform(buttonName, state.value);

            let observable = this[this._mapping.buttonObservableNames[buttonName]];
            if (observable) {
                observable.notifyObservers(state);
            }
        }

        public update() {
            super.update();

            if (this.browserGamepad.axes) {
                for (let axis = 0; axis < this._mapping.axisMeshNames.length; axis++) {
                    this.lerpAxisTransform(axis, this.browserGamepad.axes[axis]);
                }
            }
        }
    }

    class LoadedMeshInfo {
        public rootNode: AbstractMesh;
        public pointingPoseNode: AbstractMesh;
        public holdingPoseNode: AbstractMesh;
        public buttonMeshes: { [id: string] : IButtonMeshInfo; } = {};
        public axisMeshes: { [id: number] : IAxisMeshInfo; } = {};
    }

    interface IMeshInfo {
        index: number;
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
        buttons: string[];
        buttonMeshNames: { [id: string ] : string };
        buttonObservableNames: { [id: string ] : string };
        axisMeshNames: string[];
        pointingPoseMeshName: string;
        holdingPoseMeshName: string;
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
    