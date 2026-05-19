import { Navigate, type RouteObject } from "react-router-dom";
import {
  AppRoot,
  LibraryLayout,
  SettingsLayout,
  StandaloneLayout,
} from "./components/shell";
import { ActivityPage } from "./pages/activity";
import { SaveDetailPage } from "./pages/save-detail-page";
import { SavesView } from "./pages/saves-view";
import { DEFAULT_SECTION, SECTIONS } from "./pages/settings/registry";
import { TrashView } from "./pages/trash-view";
import { WelcomePage } from "./pages/welcome";

function settingsChildren(): RouteObject[] {
  return [
    {
      index: true,
      element: <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />,
    },
    ...SECTIONS.map(
      (section): RouteObject => ({
        path: section.path,
        element: <section.component />,
      }),
    ),
    {
      path: "*",
      element: <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />,
    },
  ];
}

const saveSplitChild: RouteObject = {
  path: "save/:id",
};

export function buildRoutes(): RouteObject[] {
  return [
    {
      element: <AppRoot />,
      children: [
        {
          element: <LibraryLayout />,
          children: [
            {
              path: "/",
              element: <SavesView />,
              children: [saveSplitChild],
            },
            {
              path: "source/:source",
              element: <SavesView mode="source" />,
              children: [saveSplitChild],
            },
            {
              path: "untagged",
              element: <SavesView mode="untagged" />,
              children: [saveSplitChild],
            },
            {
              path: "recents",
              element: <SavesView mode="recents" />,
              children: [saveSplitChild],
            },
            {
              path: "random",
              element: <SavesView mode="random" />,
              children: [saveSplitChild],
            },
            {
              path: "trash",
              element: <TrashView />,
              children: [saveSplitChild],
            },
            { path: "detail/:id", element: <SaveDetailPage /> },
            {
              path: "source/:source/detail/:id",
              element: <SaveDetailPage />,
            },
            { path: "untagged/detail/:id", element: <SaveDetailPage /> },
            { path: "recents/detail/:id", element: <SaveDetailPage /> },
            { path: "random/detail/:id", element: <SaveDetailPage /> },
            { path: "trash/detail/:id", element: <SaveDetailPage /> },
            { path: "activity", element: <ActivityPage /> },
          ],
        },
        {
          path: "settings",
          element: <SettingsLayout />,
          children: settingsChildren(),
        },
        {
          element: <StandaloneLayout />,
          children: [{ path: "welcome", element: <WelcomePage /> }],
        },
      ],
    },
  ];
}
