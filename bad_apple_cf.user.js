// ==UserScript==
// @name        Bad Apple!! Codeforces
// @namespace   https://github.com/meooow25
// @match       *://*.codeforces.com/profile/*
// @grant       GM_getResourceURL
// @grant       GM.getResourceURL
// @grant       GM.getResourceUrl
// @version     0.1.3
// @author      meooow
// @description Bad Apple!!
// @resource    bad_apple.mp3 https://raw.githubusercontent.com/meooow25/bad-apple-cf/c153a5888e16d426a9c6d2cf6558e70e06f22a5d/bad_apple.mp3
// @resource    frames.json https://raw.githubusercontent.com/meooow25/bad-apple-cf/c153a5888e16d426a9c6d2cf6558e70e06f22a5d/frames.json
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
      margin-right: 1em;
    }
  `;
  document.head.appendChild(style);

  async function setupCells(forward = true) {
    const svgns = "http://www.w3.org/2000/svg";
    const cellOffset = 13;
    const { svg, cols, col53 } = getSvg();
    const col1 = cols[0], col52 = cols[51];

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
      // First column may have less than 7 days
      let cnt = col1.querySelectorAll("rect").length;
      let y = Number(col1.querySelector("rect").getAttribute("y"));
      for (let i = cnt; i < 7; i++) {
        y -= cellOffset;
        col1.insertBefore(newCell(y), col1.firstChild);
      }

      // 52nd column may have less than 7 days
      cnt = col52.querySelectorAll("rect").length;
      y = Number(col52.querySelector("rect:last-child").getAttribute("y"));
      for (let i = cnt; i < 7; i++) {
        y += cellOffset;
        col52.appendChild(newCell(y));
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

    frames = frames.map((frame) => {
      // Decode run length encoding
      const out = [];
      for (let i = 0; i < frame.length; i += 2) {
        for (let j = 0; j < frame[i + 1]; j++) {
          out.push(frame[i]);
        }
      }
      return out;
    });
    const frameDurationMs = 1000 / fps;

    // Frames use the 5-color palette used by CF
    const palette = [
      "#EBEDF0",
      "#91DA9E",
      "#40C463",
      "#30A14E",
      "#216E39",
    ];

    let svg;
    let cells;
    let originalFills;
    let playing;
    let drawnFrames;

    async function transitionCellFills(fun) {
      cells.forEach(cell => cell.classList.add("fill-anim"));
      forceRestyle(svg);
      fun();
      await delay(fillAnimDur);
      cells.forEach(cell => cell.classList.remove("fill-anim"));
    }

    async function beforePlay() {
      const { svg: svg_, cols } = getSvg();
      svg = svg_;

      cells = [];
      originalFills = [];
      for (const col of cols) {
        for (const cell of col.querySelectorAll("rect")) {
          cells.push(cell);
          originalFills.push([cell, cell.getAttribute("fill")]);
        }
      }

      await transitionCellFills(() => {
        cells.forEach(cell => cell.setAttribute("fill", palette[4]));
      });
    }

    function play() {
      playing = true;
      drawnFrames = 0;
      let start;
      let lastFrameIdx;
      let lastFrame = [];

      function drawFrame(now) {
        const currentFrameIdx = Math.min(Math.trunc((now - start) / frameDurationMs), frames.length - 1);
        if (currentFrameIdx === lastFrameIdx) {
          return;
        }
        const currentFrame = frames[currentFrameIdx];
        for (let i = 0; i < cells.length; i++) {
          if (currentFrame[i] !== lastFrame[i]) {
            cells[i].setAttribute("fill", palette[currentFrame[i]]);
          }
        }
        drawnFrames++;
        lastFrameIdx = currentFrameIdx;
        lastFrame = currentFrame;
      }

      function drawFrameWrapper(now) {
        if (!playing) {
          return;
        }
        if (start === undefined) {
          start = now;
        }
        drawFrame(now);
        window.requestAnimationFrame(drawFrameWrapper);
      }
      window.requestAnimationFrame(drawFrameWrapper);
    }

    async function stop() {
      playing = false;
      await delay(50); // Wait a bit in case the last frame is still being drawn
      console.log(`Animation stopped, drawn frames ${drawnFrames}/${frames.length}`);
      drawnFrames = null;
    }

    async function afterStop() {
      await transitionCellFills(() => {
        originalFills.forEach(([cell, fill]) => cell.setAttribute("fill", fill));
      });
      cells = null;
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
  async function play() {
    state = "wait";
    disableSelects();
    await expandGraph();
    await setupCells();
    await video.beforePlay();
    audio.play();
    button.textContent = "Stop";
    state = "playing";
  }

  audio.addEventListener("pause", async () => {
    state = "wait";
    await video.stop();
    await video.afterStop();
    await setupCells(false);
    await expandGraph(false);
    disableSelects(false);
    button.textContent = "Play";
    state = "stopped";
  });

  button.addEventListener("click", async () => {
    if (state === "stopped") {
      await play();
    } else if (state === "playing") {
      audio.pause();
      audio.currentTime = 0;
    }
  });

})();
