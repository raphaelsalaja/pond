import { IS_MAC } from "@/shared/lib/platform";
import { defineCustomSection, group } from "./engine-types";

export const viewerSection = defineCustomSection({
  title: "Preview",
  description: "Preview controls, image rendering, and playback.",
  groups: [
    group.prefs("viewer", {
      title: "Controls",
      items: [
        {
          control: "select",
          key: "spaceBehavior",
          title: "Spacebar Preview",
          description: "How the preview opens and closes.",
          options: [
            { value: "toggle", label: "Press to Open or Close" },
            { value: "hold", label: "Hold to Preview" },
          ],
        },
        {
          control: "select",
          key: "spaceAction",
          title: "Space Action",
          description: "What Space opens for the selected Save.",
          options: [
            { value: "preview", label: "Quick Preview" },
            ...(IS_MAC
              ? [{ value: "quick-look", label: "macOS Quick Look" }]
              : []),
            { value: "presentation", label: "Presentation" },
            { value: "detached", label: "Detached Window" },
            { value: "open", label: "Save Details" },
            { value: "none", label: "Do Nothing" },
          ],
        },
        {
          control: "select",
          key: "doubleClickAction",
          title: "Double-Click Action",
          description: "What opens when you double-click a Save.",
          options: [
            { value: "open", label: "Save Details" },
            { value: "preview", label: "Quick Preview" },
            { value: "presentation", label: "Presentation" },
            { value: "detached", label: "Detached Window" },
            { value: "none", label: "Do Nothing" },
          ],
        },
        {
          control: "select",
          key: "middleClickAction",
          title: "Middle-Click Action",
          description: "What opens when you middle-click a Save.",
          options: [
            { value: "open", label: "Save Details" },
            { value: "preview", label: "Quick Preview" },
            { value: "presentation", label: "Presentation" },
            { value: "detached", label: "Detached Window" },
            { value: "none", label: "Do Nothing" },
          ],
        },
        {
          control: "select",
          key: "wheelBehavior",
          title: "Image Scrolling",
          description: "Pinch and Alt-scroll still zoom.",
          options: [
            { value: "scroll", label: "Pan Image" },
            { value: "zoom", label: "Zoom Image" },
            { value: "navigate", label: "Previous or Next Save" },
          ],
        },
      ],
    }),
    group.prefs("viewer", {
      title: "Images",
      items: [
        {
          control: "select",
          key: "defaultImageSize",
          title: "Default Image Size",
          description: "Fit the viewer, or open at actual size.",
          options: [
            { value: "fit", label: "Fit" },
            { value: "actual", label: "Actual Size" },
          ],
        },
        {
          control: "switch",
          key: "rememberImagePosition",
          title: "Remember Image Position",
          description: "Restores zoom and position for each image.",
        },
        {
          control: "select",
          key: "imageRendering",
          title: "Image Rendering",
          description: "Smooth edges, or pixels when zoomed in.",
          options: [
            { value: "smooth", label: "Smooth" },
            { value: "pixelated", label: "Pixelated" },
          ],
        },
        {
          control: "select",
          key: "transparentBackground",
          title: "Transparent Areas",
          description: "Background behind transparent images.",
          options: [
            { value: "none", label: "Theme" },
            { value: "checkerboard", label: "Checkerboard" },
            { value: "white", label: "White" },
            { value: "black", label: "Black" },
          ],
        },
      ],
    }),
    group.prefs("viewer", {
      title: "Gallery",
      items: [
        {
          control: "select",
          key: "galleryFit",
          title: "Thumbnail Fit",
          description: "Show the full image, or fill the card.",
          options: [
            { value: "fit", label: "Fit" },
            { value: "fill", label: "Fill" },
          ],
        },
        {
          control: "select",
          key: "thumbnailBehavior",
          title: "Thumbnail Behavior",
          description: "Scrub images on hover, or keep them still.",
          options: [
            { value: "still", label: "Still" },
            { value: "scrub", label: "Scrub on Hover" },
          ],
        },
        {
          control: "select",
          key: "thumbnailSpeed",
          title: "Thumbnail Scrub Speed",
          description: "How fast pointer movement advances frames.",
          options: [
            { value: "slow", label: "Slow" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Fast" },
          ],
        },
        {
          control: "select",
          key: "thumbnailQuality",
          title: "Thumbnail Quality",
          description: "Loads the original when enlarged.",
          options: [
            { value: "fast", label: "Fast" },
            { value: "balanced", label: "Balanced" },
            { value: "quality", label: "Quality" },
          ],
        },
        {
          control: "switch",
          key: "gifAutoplay",
          title: "Autoplay GIFs",
          description: "Play GIFs while their viewer is active.",
        },
        {
          control: "switch",
          key: "hoverZoom",
          title: "Hover Zoom",
          description: "Magnify thumbnail details around the pointer.",
        },
        {
          control: "select",
          key: "thumbnailBackground",
          title: "Thumbnail Background",
          description: "Fills behind transparent images.",
          options: [
            { value: "none", label: "None" },
            { value: "black", label: "Black" },
            { value: "gray", label: "Gray" },
            { value: "white", label: "White" },
            { value: "grid", label: "Grid" },
          ],
        },
      ],
    }),
    group.prefs("viewer", {
      title: "Video",
      items: [
        {
          control: "switch",
          key: "autoplayVideo",
          title: "Autoplay Videos",
          description: "Play the active video when you open it.",
        },
        {
          control: "switch",
          key: "hoverVideo",
          title: "Hover Preview",
          description: "Play the video while the pointer is over it.",
        },
        {
          control: "switch",
          key: "rememberPlayback",
          title: "Remember Playback Position",
          description: "Resume videos where you left off.",
        },
        {
          control: "switch",
          key: "loopShortVideos",
          title: "Loop Short Videos",
          description: "Repeat clips shorter than 30 seconds.",
        },
        {
          control: "select",
          key: "videoSeekSeconds",
          title: "Seek Interval",
          description: "How far the arrow keys skip in a video.",
          options: [
            { value: 5, label: "5 Seconds" },
            { value: 10, label: "10 Seconds" },
            { value: 15, label: "15 Seconds" },
            { value: 30, label: "30 Seconds" },
          ],
        },
        {
          control: "select",
          key: "videoWheelBehavior",
          title: "Video Scrolling",
          description: "Seek, change volume, or ignore the wheel.",
          options: [
            { value: "progress", label: "Seek Video" },
            { value: "volume", label: "Change Volume" },
            { value: "none", label: "Do Nothing" },
          ],
        },
      ],
    }),
  ],
});
