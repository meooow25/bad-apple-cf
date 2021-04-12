// ==UserScript==
// @name        Bad Apple!! Codeforces
// @namespace   https://github.com/meooow25
// @match       *://*.codeforces.com/profile/*
// @grant       GM_getResourceURL
// @grant       GM.getResourceURL
// @grant       GM.getResourceUrl
// @version     0.1.1
// @author      meooow
// @description Bad Apple!!
// @resource    bad_apple.mp3 https://raw.githubusercontent.com/meooow25/bad-apple-cf/86fa050d521bcdd87444713237e7dfd39821c993/bad_apple.mp3
// @resource    frames.json https://raw.githubusercontent.com/meooow25/bad-apple-cf/86fa050d521bcdd87444713237e7dfd39821c993/frames.json
// ==/UserScript==

(async function() {

  // Userscript manager compatibility
  const gm = GM || {};
  gm.getResourceURL = gm.getResourceURL || gm.getResourceUrl || (name => Promise.resolve(GM_getResourceURL(name)));

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // https://stackoverflow.com/a/31862081
  function forceRestyle(el) {
    window.getComputedStyle(el).opacity;
  }

  const graph = document.querySelector("#userActivityGraph");
  if (!graph) {
    // Not all profiles have activity graphs
    return;
  }
  
  function getSvg() {
    const svg = graph.querySelector("svg");
    const parentG = svg.querySelector("g");
    const cols = Array.from(parentG.querySelectorAll("g"));  // 52+1 cols of 7 days each
    const col53 = cols.pop();
    return { svg, cols, col53 };
  }

  const opacityAnimDur = 300;
  const fillAnimDur = 300;
  const style = document.createElement("style");
  style.textContent = `
    svg .opacity-anim {
      transition: opacity ${opacityAnimDur}ms linear;
    }
    svg .fill-anim {
      transition: fill ${fillAnimDur}ms linear;
    }
    .play-button {
      font-family: verdana, arial, sans-serif;
      font-size: 1em;
    }
  `;
  document.head.appendChild(style);

  async function setupCells(forward = true) {
    const svgns = "http://www.w3.org/2000/svg";
    const cellOffset = 13;
    const { svg, cols, col53 } = getSvg();

    function newCell(y) {
      const rect = document.createElementNS(svgns, "rect");
      rect.setAttribute("width", 11);
      rect.setAttribute("height", 11);
      rect.setAttribute("y", y);
      rect.setAttribute("fill", "#EBEDF0");
      rect.classList.add("opacity-anim", "new-cell");
      rect.setAttribute("opacity", 0.01);
      return rect;
    }

    if (forward) {
      // First row may have less than 7 days
      const col1 = cols[0];
      let cnt = col1.querySelectorAll("rect").length;
      let y = col1.querySelector("rect").getAttribute("y");
      for (let i = cnt; i < 7; i++) {
        y -= cellOffset;
        col1.insertBefore(newCell(y), col1.firstChild);
      }
      // Already 7 days, need 39 for 52x39 display
      y = 78; // Last y
      for (let i = 7; i < 39; i++) {
        y += cellOffset;
        for (const col of cols) {
          col.appendChild(newCell(y));
        }
      }
      // To hide col 53
      col53.classList.add("opacity-anim");
    }

    forceRestyle(svg);
    if (forward) {
      svg.querySelectorAll("rect.opacity-anim").forEach(cell => cell.setAttribute("opacity", 1));
      col53.setAttribute("opacity", 0);
    } else {
      svg.querySelectorAll("rect.opacity-anim").forEach(cell => cell.setAttribute("opacity", 0));
      col53.setAttribute("opacity", 1);
    }
    await delay(opacityAnimDur);

    if (!forward) {
      svg.querySelectorAll(".new-cell").forEach(cell => cell.parentNode.removeChild(cell));
      col53.classList.remove("opacity-anim");
    }
  }

  async function expandGraph(forward = true) {
    // Ideally would animate the viewBox but can't in a simple enough way
    // Expanding the containing div instead

    const { svg } = getSvg();

    function getHeight(el) {
      return Number(getComputedStyle(el).height.slice(0, -2)); // remove px suffix
    }

    const [cur, tgt] = forward ? [110, 526] : [526, 110];
    const pxPerUnit = getHeight(svg) / cur;
    const change = (tgt - cur) * pxPerUnit;

    const graphHeight = getHeight(graph);
    graph.style.height = graphHeight + "px";

    if (!forward) {
      svg.setAttribute("viewBox", "0 0 721 110");
    }

    forceRestyle(graph);
    graph.style.transition = "height 300ms ease-out";
    graph.style.height = graphHeight + change + "px";
    await delay(300);

    if (forward) {
      svg.setAttribute("viewBox", "0 0 721 526");
    }

    graph.style.transition = null;
    graph.style.height = null;
  }

  function disableSelects(forward = true) {
    // Disable selects to prevent the svg from being swapped out during animation
    const selects = document.querySelectorAll("._UserActivityFrame_selector select");
    for (const el of selects) {
      if (forward) {
        el.setAttribute("disabled", "");
      } else {
        el.removeAttribute("disabled");
      }
    }
  }

  async function setupAudio() {
    const audioUrl = await gm.getResourceURL("bad_apple.mp3");
    const source = document.createElement("source");
    source.src = audioUrl;
    source.type = "audio/mpeg";
    const audio = new Audio();
    audio.append(source);
    return audio;
  }

  async function setupVideo() {
    const frameDataUrl = await gm.getResourceURL("frames.json");
    let { fps, frames } = await fetch(frameDataUrl).then(r => r.json());

    // Frames use the 5-color palette used by CF
    const palette = [
      "#EBEDF0",
      "#91DA9E",
      "#40C463",
      "#30A14E",
      "#216E39",
    ];

    let svg;
    let grid;
    let originalFills;
    let timerIds;

    async function transitionCellFills(fun) {
      grid.flat().forEach(cell => cell.classList.add("fill-anim"));
      forceRestyle(svg);
      fun();
      await delay(fillAnimDur);
      grid.flat().forEach(cell => cell.classList.remove("fill-anim"));
    }

    async function beforePlay() {
      const { svg: svg_, cols } = getSvg();
      svg = svg_;

      grid = [];
      originalFills = [];
      for (const col of cols) {
        const gridCol = [];
        for (const cell of col.querySelectorAll("rect")) {
          gridCol.push(cell);
          originalFills.push([cell, cell.getAttribute("fill")]);
        }
        grid.push(gridCol);
      }

      await transitionCellFills(() => {
        grid.flat().forEach(cell => cell.setAttribute("fill", palette[4]));
      });
    }

    function play() {
      timerIds = [];
      const start = performance.now();
      const delayMs = 1000 / fps;
      function drawFrame(frameNum) {
        for (const [x, y, i] of frames[frameNum]) {
          grid[x][y].setAttribute("fill", palette[i]);
        }
        if (frameNum === frames.length - 1) {
          const actual = performance.now() - start;
          const expected = delayMs * frames.length;
          console.log(`Play time ${actual}, expected ${expected}`);
        }
      }

      for (let i = 0; i < frames.length; i++) {
        const id = setTimeout(() => drawFrame(i), i * delayMs);
        timerIds.push(id);
      }
    }

    function stop() {
      timerIds.forEach(id => clearTimeout(id));
    }

    async function afterStop() {
      await transitionCellFills(() => {
        originalFills.forEach(([cell, fill]) => cell.setAttribute("fill", fill));
      });
      grid = null;
      originalFills = null;
    }

    return { beforePlay, play, stop, afterStop };
  }

  function setupButton() {
    const header = document.querySelector("._UserActivityFrame_header");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Bad Apple!!";
    button.classList.add("play-button");
    header.insertBefore(button, header.firstChild);
    return button;
  }

  const audio = await setupAudio();
  const video = await setupVideo();
  const button = setupButton();
  let state = "stopped";

  audio.addEventListener("playing", () => video.play());
  async function playAll() {
    disableSelects();
    await expandGraph();
    await setupCells();
    await video.beforePlay();
    audio.play();
    button.textContent = "Stop";
    state = "playing";
  }

  audio.addEventListener("pause", () => video.stop());
  async function stopAll() {
    audio.pause();
    audio.currentTime = 0;
    await video.afterStop();
    await setupCells(false);
    await expandGraph(false);
    disableSelects(false);
    button.textContent = "Play";
    state = "stopped";
  }

  audio.addEventListener("ended", async () => {
    state = "wait";
    await stopAll();
  });

  button.addEventListener("click", async () => {
    const stateCopy = state;
    state = "wait";
    if (stateCopy === "stopped") {
      await playAll();
    } else if (stateCopy === "playing") {
      await stopAll();
    }
  });

})();
