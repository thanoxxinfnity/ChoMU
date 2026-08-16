package com.trellis.studio.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.google.android.filament.IndirectLight
import io.github.sceneview.Scene
import io.github.sceneview.math.Position
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberEnvironment
import io.github.sceneview.rememberEnvironmentLoader
import io.github.sceneview.rememberMainLightNode
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNodes
import java.io.File

/**
 * Renders a GLB file with Filament (via SceneView) with orbit + pinch-zoom
 * touch gestures provided by the default camera manipulator.
 *
 * Filament renders unlit/black without an explicit light and indirect
 * light — SceneView's `Scene` composable does not add either on its own.
 * The original version of this file only supplied camera + model, which
 * would have rendered every generated model as a black silhouette (the
 * same "black model" problem TRELLIS-generated GLBs hit in every bare
 * three.js/Filament viewer that skips lighting setup). A directional main
 * light plus a soft indirect light fixes it.
 */
@Composable
fun ModelViewer(
    modelPath: String,
    modifier: Modifier = Modifier
) {
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)
    val environmentLoader = rememberEnvironmentLoader(engine)
    val cameraNode = rememberCameraNode(engine) {
        position = Position(x = 0.0f, y = 0.5f, z = 2.5f)
    }
    val mainLightNode = rememberMainLightNode(engine) {
        intensity = 100_000.0f
    }
    val environment = rememberEnvironment(environmentLoader) {
        environmentLoader.createEnvironment(
            indirectLight = IndirectLight.Builder()
                .intensity(30_000.0f)
                .build(engine)
        )
    }
    val modelNode = remember(modelPath) {
        ModelNode(
            modelInstance = modelLoader.createModelInstance(File(modelPath)),
            scaleToUnits = 1.5f
        )
    }
    val nodes = rememberNodes { add(modelNode) }

    Scene(
        modifier = modifier,
        engine = engine,
        modelLoader = modelLoader,
        environmentLoader = environmentLoader,
        environment = environment,
        mainLightNode = mainLightNode,
        cameraNode = cameraNode,
        cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = cameraNode.worldPosition,
            targetPosition = Position(0f, 0f, 0f)
        ),
        childNodes = nodes
    )
}
