export const panelHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <base target="_top" href="{{.HostPrefix}}">
    <meta name='color-scheme' content='dark light'>
<script>
const pendingRequests = new Map();
let syscallReqId = 0;

globalThis.syscall = async (name, ...args) => {
  return await new Promise((resolve, reject) => {
    syscallReqId++;
    pendingRequests.set(syscallReqId, { resolve, reject });
    globalThis.parent.postMessage({
      type: "syscall",
      id: syscallReqId,
      name,
      args,
    }, "*");
  });
};

// Lets a widget's own script write its (possibly edited) content back into
// the page's source -- e.g. the chess FEN widget's board editor. \`oldText\`
// is what the widget believes the fence body currently holds; the parent
// (iframe_widget.ts) only applies \`newText\` if that still matches the real
// document, otherwise it rejects instead of silently overwriting a change
// made elsewhere in the meantime.
let replaceBodyReqId = 0;
const pendingReplaceBody = new Map();
globalThis.replaceWidgetBody = async (oldText, newText) => {
  return await new Promise((resolve, reject) => {
    replaceBodyReqId++;
    pendingReplaceBody.set(replaceBodyReqId, { resolve, reject });
    globalThis.parent.postMessage({
      type: "replaceBody",
      id: replaceBodyReqId,
      oldText,
      newText,
    }, "*");
  });
};

let oldHeight = undefined;
let heightChecks = 0;
let resizeObserver = undefined;

globalThis.addEventListener("message", (message) => {
  const data = message.data;
  switch (data.type) {
    case "html":
      document.body.innerHTML = data.html;
      if(data.theme) {
        document.getElementsByTagName("html")[0].setAttribute("data-theme", data.theme);
      }
      if (data.script) {
        try {
          eval(data.script);
        } catch (e) {
          console.error("Error evaling script", e);
        }
      }
      setTimeout(() => {
        oldHeight = undefined;
        updateHeight();
        if (typeof ResizeObserver !== "undefined") {
          // Event-driven, no cutoff: catches a panel toggled visible/hidden,
          // content added, images/fonts loading late, etc. -- at ANY point in
          // the widget's lifetime, not just its first render.
          if (resizeObserver) resizeObserver.disconnect();
          resizeObserver = new ResizeObserver(() => updateHeight());
          resizeObserver.observe(document.body);
        } else {
          // Fallback for a sandbox without ResizeObserver -- old bounded
          // polling behavior (better than nothing, though it still misses a
          // resize past the cutoff).
          heightChecks = 0;
          pollHeight();
        }
      });
      break;
    case "syscall-response":
      {
        const syscallId = data.id;
        const lookup = pendingRequests.get(syscallId);
        if (!lookup) {
          console.log(
            "Current outstanding requests",
            pendingRequests,
            "looking up",
            syscallId,
          );
          throw Error("Invalid request id");
        }
        pendingRequests.delete(syscallId);
        if (data.error) {
          lookup.reject(new Error(data.error));
        } else {
          lookup.resolve(data.result);
        }
      }

      break;
    case "replaceBody-response":
      {
        const lookup = pendingReplaceBody.get(data.id);
        if (!lookup) break;
        pendingReplaceBody.delete(data.id);
        if (data.error) {
          lookup.reject(new Error(data.error));
        } else {
          lookup.resolve(data.result);
        }
      }
      break;
    case "theme":
      if (data.theme) {
        document.documentElement.setAttribute("data-theme", data.theme);
      }
      break;
  }
});

function updateHeight() {
  const body = document.body, html = document.documentElement;
  let height = Math.max(body.offsetHeight, html.offsetHeight);
  if(height !== oldHeight) {
    oldHeight = height;
    globalThis.parent.postMessage({
      type: "setHeight",
      height: height,
    });
  }
}

// Old bounded-polling fallback, only used when ResizeObserver isn't
// available in this sandbox -- see the "html" message handler above.
function pollHeight() {
  updateHeight();
  heightChecks++;
  if(heightChecks < 25) {
    setTimeout(pollHeight, 100);
  }
}

function loadJsByUrl(url,integrity=null) {
  const script = document.createElement("script");
  script.src = url;
  if(integrity){
    script.integrity=integrity;
    script.crossOrigin="anonymous"; //for some weird reason this attribute is case sensitive when used in JS
  }

  return new Promise((resolve) => {
    script.onload = resolve;
    document.documentElement.firstChild.appendChild(script);
  });
}
</script>
</head>
<body>

</body>
</html>`;
