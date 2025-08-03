// UI Management for Physics Modes
export function createPhysicsUI(clothMesh) {
  const uiContainer = document.createElement('div');
  uiContainer.style.position = 'absolute';
  uiContainer.style.top = '20px';
  uiContainer.style.left = '20px';
  uiContainer.style.zIndex = '1000';
  uiContainer.style.fontFamily = 'Arial, sans-serif';
  uiContainer.style.color = 'white';
  uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  uiContainer.style.padding = '15px';
  uiContainer.style.borderRadius = '8px';

  const title = document.createElement('h3');
  title.textContent = 'Physics Modes';
  title.style.margin = '0 0 10px 0';
  title.style.fontSize = '16px';
  uiContainer.appendChild(title);

  // No Physics Button
  const noneButton = document.createElement('button');
  noneButton.textContent = 'No Physics';
  noneButton.style.margin = '5px';
  noneButton.style.padding = '8px 12px';
  noneButton.style.backgroundColor = '#4CAF50';
  noneButton.style.color = 'white';
  noneButton.style.border = 'none';
  noneButton.style.borderRadius = '4px';
  noneButton.style.cursor = 'pointer';
  noneButton.onclick = () => window.setPhysicsMode('none');
  uiContainer.appendChild(noneButton);

  // Gravity Button
  const gravityButton = document.createElement('button');
  gravityButton.textContent = 'Gravity & Draping';
  gravityButton.style.margin = '5px';
  gravityButton.style.padding = '8px 12px';
  gravityButton.style.backgroundColor = '#2196F3';
  gravityButton.style.color = 'white';
  gravityButton.style.border = 'none';
  gravityButton.style.borderRadius = '4px';
  gravityButton.style.cursor = 'pointer';
  gravityButton.onclick = () => window.setPhysicsMode('gravity');
  uiContainer.appendChild(gravityButton);

  // Tension Button
  const tensionButton = document.createElement('button');
  tensionButton.textContent = 'Tension & Stress';
  tensionButton.style.margin = '5px';
  tensionButton.style.padding = '8px 12px';
  tensionButton.style.backgroundColor = '#FF9800';
  tensionButton.style.color = 'white';
  tensionButton.style.border = 'none';
  tensionButton.style.borderRadius = '4px';
  tensionButton.style.cursor = 'pointer';
  tensionButton.onclick = () => window.setPhysicsMode('tension');
  uiContainer.appendChild(tensionButton);

  // Instructions
  const instructions = document.createElement('div');
  instructions.innerHTML = `
    <br><strong>Controls:</strong><br>
    • Draw cuts without Ctrl<br>
    • Hold Ctrl + drag to orbit<br>
    • Switch physics modes above<br>
    • Gravity mode: top edge pinned
  `;
  instructions.style.fontSize = '12px';
  instructions.style.lineHeight = '1.4';
  uiContainer.appendChild(instructions);

  document.body.appendChild(uiContainer);
}