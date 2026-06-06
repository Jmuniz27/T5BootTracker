{
  description = "Boottracker: Entorno Local";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            uv
            nodejs_20
            tesseract
            postgresql_16
            gcc
            zlib
            libjpeg
            stdenv.cc.cc.lib
            redis
          ];
          shellHook = ''
            echo "Entorno de Desarrollo Local activado"

            export LDFLAGS="-L${pkgs.lib.makeLibraryPath [
              pkgs.zlib
              pkgs.libjpeg
              pkgs.postgresql_16
            ]}"
            export CPPFLAGS="-I${pkgs.zlib.dev}/include -I${pkgs.libjpeg.dev}/include -I${pkgs.postgresql_16}/include"

            if [ ! -d ".venv" ]; then
              echo "Creando entorno virtual e instalando dependencias..."
              uv venv .venv --python 3.12
              source .venv/bin/activate
              uv pip install -r backend/requirements/local.txt
              echo "✅ Backend listo."
            else
              source .venv/bin/activate
            fi

            if [ ! -d "frontend/node_modules" ]; then
              echo "Instalando dependencias del frontend..."
              cd frontend && npm install && cd ..
              echo "✅ Frontend listo."
            fi

            echo "Usa docker-compose para levantar la BD."

            if [ -x "$(command -v zsh)" ] && [ "$SHELL" != "$(command -v zsh)" ]; then
              export SHELL="$(command -v zsh)"
              exec zsh
            fi
          '';
        };
      }
    );
}
