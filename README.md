# 🧵 Virtual Reality Project – Cloth Mesh Cutting

This repository contains my course submission for the **Virtual Reality** course. It consists of two projects demonstrating cloth mesh simulation and interaction using **OpenGL (C++)** and **Three.js (JavaScript)**.

---

## 📌 Part 1: Cloth Mesh Cutting using OpenGL (C++)

### ✅ Features Implemented
- **Interactive Cloth Cutting**
  - Users can draw a line on the screen to simulate a cut.
  - 2D mouse input is converted into 3D rays using projection-view matrix math.
  - **Möller–Trumbore algorithm** is used to detect ray-triangle intersections.
  - Intersected triangles are dynamically removed from the mesh.
  
- **Orbit Camera**
  - Implemented user-controlled orbiting camera with zoom, azimuth, and elevation.

- **Real-Time Mesh Updates**
  - After every cut, the mesh (vertex/index data) is re-uploaded to the GPU.

- **Shader-Based Rendering**
  - Basic vertex and fragment shaders are used to render the cloth.

### 🔧 Technologies Used
- C++  
- OpenGL  
- GLFW  
- GLAD  
- GLM  
- Custom GLSL shaders

---

## 🌐 Part 2: Cloth Simulation with Physics using Three.js (JavaScript)

### ✅ Features Implemented
- **Basic Cloth Physics with Gravity**
  - The cloth is simulated using a grid of particles.
  - Each point experiences a downward gravitational force.
  - The cloth reacts and moves naturally under gravity.

- **Real-Time Rendering**
  - The simulation is updated and rendered continuously using Three.js.

- **Foundation for Future Physics**
  - The system is structured to easily add constraints, wind forces, and user interaction (e.g., tearing or pinning).

### 🔧 Technologies Used
- JavaScript  
- Three.js  
- WebGL  
- HTML5 / CSS

---

## 📁 Folder Structure
