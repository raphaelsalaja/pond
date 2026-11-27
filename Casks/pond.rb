cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.8.3"
  sha256 arm:   "064bf18e6ed7191879b6915ea279f5e381f65f3086d32dd788cce9eddbfc50ef",
         intel: "352d28ecb955dbbc05b54dbc1f8efd607991799d9606fff723c7ef5581ff56ec"

  url "https://github.com/raphaelsalaja/pond/releases/download/v#{version}/Pond-#{version}-#{arch}.dmg"
  name "Pond"
  desc "Local-first archive for things you save from the web"
  homepage "https://github.com/raphaelsalaja/pond"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "Pond.app"

  zap trash: [
    "~/Library/Application Support/pond",
    "~/Library/Logs/pond",
    "~/Library/Preferences/so.pond.desktop.plist",
  ]
end
