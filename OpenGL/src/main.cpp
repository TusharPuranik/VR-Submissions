#define GLM_ENABLE_EXPERIMENTAL

#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <vector>
#include <iostream>
#include <set>
#include "../include/shader_util.h"
#include <glm/gtx/string_cast.hpp>


struct Vertex {
    glm::vec3 position;
};

std::vector<Vertex> clothVertices;
std::vector<GLuint> clothIndices;

GLuint VAO, VBO, EBO;
GLuint lineVAO, lineVBO;
GLuint shaderProgram;
GLuint lineShaderProgram;

float lastX = 400, lastY = 300;
float fov = 45.0f;
float azimuth = 0.0f, elevation = 20.0f;
float cameraDistance = 4.0f;
bool firstMouse = true, rightMouseDown = false;
bool isCutting = false;

glm::vec3 cameraPos, cameraFront, cameraUp = glm::vec3(0, 1, 0);
glm::mat4 projection, view;
const unsigned int SCR_WIDTH = 800;
const unsigned int SCR_HEIGHT = 600;
glm::vec3 target = glm::vec3(0.0f, 0.0f, 0.0f);

std::vector<glm::vec2> cuttingPoints2D;

bool intersectRayTriangle(
    const glm::vec3& orig, const glm::vec3& dir,
    const glm::vec3& v0, const glm::vec3& v1, const glm::vec3& v2,
    float& t, glm::vec3& intersection
) {
    const float EPSILON = 1e-6f;
    glm::vec3 edge1 = v1 - v0;
    glm::vec3 edge2 = v2 - v0;
    glm::vec3 h = glm::cross(dir, edge2);
    float a = glm::dot(edge1, h);
    if (fabs(a) < EPSILON) return false;

    float f = 1.0f / a;
    glm::vec3 s = orig - v0;
    float u = f * glm::dot(s, h);
    if (u < 0.0f || u > 1.0f) return false;

    glm::vec3 q = glm::cross(s, edge1);
    float v = f * glm::dot(dir, q);
    if (v < 0.0f || u + v > 1.0f) return false;

    t = f * glm::dot(edge2, q);
    if (t > EPSILON) {
        intersection = orig + t * dir;
        return true;
    }
    return false;
}
bool segmentIntersectsTriangle(const glm::vec3& p0, const glm::vec3& p1,
    const glm::vec3& v0, const glm::vec3& v1, const glm::vec3& v2) {

    std::cout << "[Trace] Segment dir: " << glm::to_string(dir) << ", Triangle: " << glm::to_string(v0) << ", " << glm::to_string(v1) << ", " << glm::to_string(v2) << std::endl;


    glm::vec3 dir = p1 - p0;
    glm::vec3 edge1 = v1 - v0;
    glm::vec3 edge2 = v2 - v0;

    glm::vec3 h = glm::cross(dir, edge2);
    float a = glm::dot(edge1, h);
    if (fabs(a) < 1e-6f)
        return false;

    float f = 1.0f / a;
    glm::vec3 s = p0 - v0;
    float u = f * glm::dot(s, h);
    if (u < 0.0f || u > 1.0f)
        return false;

    glm::vec3 q = glm::cross(s, edge1);
    float v = f * glm::dot(dir, q);
    if (v < 0.0f || u + v > 1.0f)
        return false;

    float t = f * glm::dot(edge2, q);
    float len = glm::length(dir);

    if (t < 0.0f || t > len + 1e-4f) // allow epsilon slack
        return false;

    return true;
}





void updateCamera() {
    float radAzimuth = glm::radians(azimuth);
    float radElevation = glm::radians(elevation);
    cameraPos.x = cameraDistance * cos(radElevation) * sin(radAzimuth);
    cameraPos.y = cameraDistance * sin(radElevation);
    cameraPos.z = cameraDistance * cos(radElevation) * cos(radAzimuth);
    cameraFront = glm::normalize(target - cameraPos);
    view = glm::lookAt(cameraPos, target, cameraUp);
}

void updateMeshOnGPU() {
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glBufferData(GL_ARRAY_BUFFER, clothVertices.size() * sizeof(Vertex), clothVertices.data(), GL_STATIC_DRAW);

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, EBO);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, clothIndices.size() * sizeof(GLuint), clothIndices.data(), GL_STATIC_DRAW);
}

void framebuffer_size_callback(GLFWwindow* window, int width, int height) {
    glViewport(0, 0, width, height);
}

void scroll_callback(GLFWwindow* window, double xoffset, double yoffset) {
    cameraDistance -= yoffset * 0.2f;
    cameraDistance = glm::clamp(cameraDistance, 1.0f, 10.0f);
}
void mouse_button_callback(GLFWwindow* window, int button, int action, int mods) {
    if (button == GLFW_MOUSE_BUTTON_RIGHT) {
        rightMouseDown = (action == GLFW_PRESS);
        firstMouse = true;
    }

    if (button == GLFW_MOUSE_BUTTON_LEFT) {
        if (action == GLFW_PRESS) {
            isCutting = true;
            cuttingPoints2D.clear();
        }
        else if (action == GLFW_RELEASE) {
            isCutting = false;

            // === NEW STEP 1: Convert 2D cuttingPoints2D to 3D segments ===
            std::vector<std::pair<glm::vec3, glm::vec3>> cutSegments3D;

            for (size_t i = 1; i < cuttingPoints2D.size(); ++i) {
                glm::vec2 p1 = cuttingPoints2D[i - 1];
                glm::vec2 p2 = cuttingPoints2D[i];

                auto toRay = [&](glm::vec2 pt) -> glm::vec3 {
                    float x = (2.0f * pt.x) / SCR_WIDTH - 1.0f;
                    float y = 1.0f - (2.0f * pt.y) / SCR_HEIGHT;
                    glm::vec4 rayNDC(x, y, -1.0f, 1.0f);
                    glm::vec4 rayEye = glm::inverse(projection) * rayNDC;
                    rayEye = glm::vec4(rayEye.x, rayEye.y, -1.0f, 0.0f);
                    glm::vec3 rayDir = glm::normalize(glm::vec3(glm::inverse(view) * rayEye));
                    return rayDir;
                    };

                glm::vec3 rayDir1 = toRay(p1);
                glm::vec3 rayDir2 = toRay(p2);

                auto rayIntersectY0 = [&](glm::vec3 rayDir) -> glm::vec3 {
                    float t = -cameraPos.y / rayDir.y;
                    return cameraPos + rayDir * t;
                    };

                glm::vec3 world1 = rayIntersectY0(rayDir1);
                glm::vec3 world2 = rayIntersectY0(rayDir2);

                cutSegments3D.push_back({ world1, world2 });
            }

            std::cout << "[Debug] Collected " << cutSegments3D.size() << " 3D cut segments.\n";

            std::vector<std::pair<glm::vec3, glm::vec3>> offsetPairs;
            float gapSize = 0.01f;

            for (const auto& segment : cutSegments3D) {
                glm::vec3 start = segment.first;
                glm::vec3 end = segment.second;
                glm::vec3 dir = glm::normalize(end - start);

                glm::vec3 perp = glm::normalize(glm::cross(dir, glm::vec3(0.0f, 1.0f, 0.0f)));

                glm::vec3 left1 = start + gapSize * perp;
                glm::vec3 right1 = start - gapSize * perp;
                glm::vec3 left2 = end + gapSize * perp;
                glm::vec3 right2 = end - gapSize * perp;

                offsetPairs.push_back({ left1, right1 });
                offsetPairs.push_back({ left2, right2 });
            }
            std::cout << "[Debug] Created " << offsetPairs.size() << " offset points (gap vertices).\n";
            
            std::set<int> trianglesToSplit;

            for (const auto& segment : cutSegments3D) {
                glm::vec3 p0 = segment.first + glm::vec3(0, 0.01f, 0);  // raise slightly above cloth
                glm::vec3 p1 = segment.second + glm::vec3(0, 0.01f, 0); // same



                for (size_t i = 0; i < clothIndices.size(); i += 3) {
                    glm::vec3 v0 = clothVertices[clothIndices[i]].position;
                    glm::vec3 v1 = clothVertices[clothIndices[i + 1]].position;
                    glm::vec3 v2 = clothVertices[clothIndices[i + 2]].position;

                    if (segmentIntersectsTriangle(p0, p1, v0, v1, v2)) {
                        trianglesToSplit.insert(i / 3);  // store triangle index
                    }
                }
            }

            std::cout << "[Debug] Triangles to split: " << trianglesToSplit.size() << std::endl;

            // 🛑 Commenting out old logic to avoid triangle deletion
            /*
            std::set<int> trianglesToRemove;
            std::vector<GLuint> newIndices;
            std::vector<Vertex> newVertices;

            for (const auto& pt : cuttingPoints2D) {
                float x = (2.0f * pt.x) / SCR_WIDTH - 1.0f;
                float y = 1.0f - (2.0f * pt.y) / SCR_HEIGHT;
                glm::vec4 rayNDC = glm::vec4(x, y, -1.0f, 1.0f);

                glm::vec4 rayEye = glm::inverse(projection) * rayNDC;
                rayEye = glm::vec4(rayEye.x, rayEye.y, -1.0f, 0.0f);
                glm::vec3 rayDir = glm::normalize(glm::vec3(glm::inverse(view) * rayEye));
                glm::vec3 rayOrigin = cameraPos;

                for (size_t i = 0; i < clothIndices.size(); i += 3) {
                    if (trianglesToRemove.count(i / 3)) continue;

                    glm::vec3 v0 = clothVertices[clothIndices[i]].position;
                    glm::vec3 v1 = clothVertices[clothIndices[i + 1]].position;
                    glm::vec3 v2 = clothVertices[clothIndices[i + 2]].position;
                    float t = 0.0f;
                    glm::vec3 intersectPt;

                    if (intersectRayTriangle(rayOrigin, rayDir, v0, v1, v2, t, intersectPt)) {
                        trianglesToRemove.insert(i / 3);
                        GLuint baseIndex = clothVertices.size();
                        clothVertices.push_back({ intersectPt });

                        newIndices.push_back(clothIndices[i]);
                        newIndices.push_back(clothIndices[i + 1]);
                        newIndices.push_back(baseIndex);

                        newIndices.push_back(clothIndices[i + 1]);
                        newIndices.push_back(clothIndices[i + 2]);
                        newIndices.push_back(baseIndex);

                        newIndices.push_back(clothIndices[i + 2]);
                        newIndices.push_back(clothIndices[i]);
                        newIndices.push_back(baseIndex);
                    }
                }
            }

            std::vector<GLuint> updatedIndices;
            for (size_t i = 0; i < clothIndices.size(); i += 3) {
                if (trianglesToRemove.count(i / 3)) continue;
                updatedIndices.push_back(clothIndices[i]);
                updatedIndices.push_back(clothIndices[i + 1]);
                updatedIndices.push_back(clothIndices[i + 2]);
            }

            updatedIndices.insert(updatedIndices.end(), newIndices.begin(), newIndices.end());
            clothIndices = updatedIndices;
            updateMeshOnGPU();
            */
        }
    }
}


void cursor_position_callback(GLFWwindow* window, double xpos, double ypos) {
    if (rightMouseDown) {
        if (firstMouse) {
            lastX = xpos;
            lastY = ypos;
            firstMouse = false;
        }

        float xoffset = xpos - lastX;
        float yoffset = lastY - ypos;
        lastX = xpos;
        lastY = ypos;

        azimuth += xoffset * 0.3f;
        elevation += yoffset * 0.3f;
        elevation = glm::clamp(elevation, -89.0f, 89.0f);
    }

    if (isCutting) {
        cuttingPoints2D.push_back(glm::vec2((float)xpos, (float)ypos));
    }
}

void generateClothMesh(int gridSize) {
    float step = 2.0f / gridSize;
    for (int z = 0; z <= gridSize; ++z) {
        for (int x = 0; x <= gridSize; ++x) {
            float xpos = -1.0f + x * step;
            float zpos = -1.0f + z * step;
            clothVertices.push_back({ glm::vec3(xpos, 0.0f, zpos) });
        }
    }

    for (int z = 0; z < gridSize; ++z) {
        for (int x = 0; x < gridSize; ++x) {
            int start = z * (gridSize + 1) + x;
            clothIndices.push_back(start);
            clothIndices.push_back(start + 1);
            clothIndices.push_back(start + gridSize + 1);

            clothIndices.push_back(start + 1);
            clothIndices.push_back(start + gridSize + 2);
            clothIndices.push_back(start + gridSize + 1);
        }
    }
}

int main() {
    glfwInit();
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

    GLFWwindow* window = glfwCreateWindow(SCR_WIDTH, SCR_HEIGHT, "3D Cloth Mesh (Orbit Camera)", nullptr, nullptr);
    if (!window) return -1;
    glfwMakeContextCurrent(window);

    glfwSetFramebufferSizeCallback(window, framebuffer_size_callback);
    glfwSetCursorPosCallback(window, cursor_position_callback);
    glfwSetScrollCallback(window, scroll_callback);
    glfwSetMouseButtonCallback(window, mouse_button_callback);

    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) return -1;

    glEnable(GL_DEPTH_TEST);
    glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
    shaderProgram = createShaderProgram("vertex_shader.glsl", "fragment_shader.glsl");
    lineShaderProgram = createShaderProgram("line_vertex.glsl", "line_fragment.glsl");
    generateClothMesh(01);

    glGenVertexArrays(1, &VAO);
    glGenBuffers(1, &VBO);
    glGenBuffers(1, &EBO);

    glBindVertexArray(VAO);
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glBufferData(GL_ARRAY_BUFFER, clothVertices.size() * sizeof(Vertex), clothVertices.data(), GL_STATIC_DRAW);

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, EBO);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, clothIndices.size() * sizeof(GLuint), clothIndices.data(), GL_STATIC_DRAW);

    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)0);
    glEnableVertexAttribArray(0);

    // Setup line VAO/VBO for cut path
    glGenVertexArrays(1, &lineVAO);
    glGenBuffers(1, &lineVBO);
    glUseProgram(lineShaderProgram);
    glBindVertexArray(lineVAO);
    glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(float) * 2 * 1000, nullptr, GL_DYNAMIC_DRAW); // up to 500 points
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);
    glBindVertexArray(0);

    glBindVertexArray(0);

    // ---- CUT LINE DRAWING ----
    if (isCutting && !cuttingPoints2D.empty()) {
        std::vector<float> linePoints;
        for (const auto& pt : cuttingPoints2D) {
            float x = (2.0f * pt.x) / SCR_WIDTH - 1.0f;
            float y = 1.0f - (2.0f * pt.y) / SCR_HEIGHT;
            linePoints.push_back(x);
            linePoints.push_back(y);
        }

        glUseProgram(lineShaderProgram);
        glBindVertexArray(lineVAO);
        glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
        glBufferData(GL_ARRAY_BUFFER, linePoints.size() * sizeof(float), linePoints.data(), GL_DYNAMIC_DRAW);
        glDrawArrays(GL_LINE_STRIP, 0, linePoints.size() / 2);
        glBindVertexArray(0);
    }


    while (!glfwWindowShouldClose(window)) {
        glClearColor(0.9f, 0.85f, 0.8f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        updateCamera();
        projection = glm::perspective(glm::radians(fov), (float)SCR_WIDTH / SCR_HEIGHT, 0.1f, 100.0f);
        glm::mat4 model = glm::mat4(1.0f);

        glUseProgram(shaderProgram);
        glUniformMatrix4fv(glGetUniformLocation(shaderProgram, "view"), 1, GL_FALSE, glm::value_ptr(view));
        glUniformMatrix4fv(glGetUniformLocation(shaderProgram, "projection"), 1, GL_FALSE, glm::value_ptr(projection));
        glUniformMatrix4fv(glGetUniformLocation(shaderProgram, "model"), 1, GL_FALSE, glm::value_ptr(model));

        glBindVertexArray(VAO);
        glDrawElements(GL_TRIANGLES, clothIndices.size(), GL_UNSIGNED_INT, 0);
        glBindVertexArray(0);

        // ---- CUT LINE DRAWING ----
        if (isCutting && !cuttingPoints2D.empty()) {
            std::vector<float> linePoints;
            for (const auto& pt : cuttingPoints2D) {
                float x = (2.0f * pt.x) / SCR_WIDTH - 1.0f;
                float y = 1.0f - (2.0f * pt.y) / SCR_HEIGHT;
                linePoints.push_back(x);
                linePoints.push_back(y);
            }

            glUseProgram(lineShaderProgram);
            glBindVertexArray(lineVAO);
            glBindBuffer(GL_ARRAY_BUFFER, lineVBO);
            glBufferData(GL_ARRAY_BUFFER, linePoints.size() * sizeof(float), linePoints.data(), GL_DYNAMIC_DRAW);
            glDrawArrays(GL_LINE_STRIP, 0, linePoints.size() / 2);
            glBindVertexArray(0);
        }


        glfwSwapBuffers(window);
        glfwPollEvents();
    }

    glfwTerminate();
    return 0;
}