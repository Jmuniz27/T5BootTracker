"""Tests for shared cédula/RUC validators in apps.authentication.validators."""
from apps.authentication.validators import (
    validate_cedula_ecuatoriana,
    validate_ruc,
    validate_identificacion,
)

VALID_CEDULA = '1713175071'
VALID_RUC_NATURAL = '1713175071001'
VALID_RUC_PUBLICO = '1760001200001'
VALID_RUC_PRIVADO = '1790012344001'


class TestValidateCedulaEcuatoriana:
    def test_valid_cedula(self):
        assert validate_cedula_ecuatoriana(VALID_CEDULA) is True

    def test_invalid_check_digit(self):
        assert validate_cedula_ecuatoriana('1713175072') is False

    def test_invalid_province(self):
        assert validate_cedula_ecuatoriana('9913175071') is False

    def test_wrong_length(self):
        assert validate_cedula_ecuatoriana('171317507') is False

    def test_non_digit(self):
        assert validate_cedula_ecuatoriana('171317507a') is False

    def test_empty_string(self):
        assert validate_cedula_ecuatoriana('') is False

    def test_none(self):
        assert validate_cedula_ecuatoriana(None) is False


class TestValidateRuc:
    def test_ruc_natural_valido(self):
        assert validate_ruc(VALID_RUC_NATURAL) is True

    def test_ruc_natural_sin_001(self):
        assert validate_ruc('1713175071002') is False

    def test_ruc_natural_base_invalida(self):
        assert validate_ruc('1713175072001') is False

    def test_ruc_publico_valido(self):
        assert validate_ruc(VALID_RUC_PUBLICO) is True

    def test_ruc_publico_invalido(self):
        assert validate_ruc('1760001210001') is False

    def test_ruc_privado_valido(self):
        assert validate_ruc(VALID_RUC_PRIVADO) is True

    def test_ruc_privado_invalido(self):
        assert validate_ruc('1790012354001') is False

    def test_tercer_digito_fuera_de_rango(self):
        # Tercer dígito 7 no corresponde a ningún tipo conocido de RUC.
        assert validate_ruc('1770012344001') is False

    def test_wrong_length(self):
        assert validate_ruc('171317507100') is False

    def test_non_digit(self):
        assert validate_ruc('171317507100a') is False

    def test_empty_string(self):
        assert validate_ruc('') is False


class TestValidateIdentificacion:
    def test_cedula_valida(self):
        assert validate_identificacion(VALID_CEDULA) is True

    def test_ruc_natural_valido(self):
        assert validate_identificacion(VALID_RUC_NATURAL) is True

    def test_ruc_publico_valido(self):
        assert validate_identificacion(VALID_RUC_PUBLICO) is True

    def test_ruc_privado_valido(self):
        assert validate_identificacion(VALID_RUC_PRIVADO) is True

    def test_longitud_9_invalida(self):
        assert validate_identificacion('171317507') is False

    def test_longitud_11_invalida(self):
        assert validate_identificacion('17131750711') is False

    def test_longitud_12_invalida(self):
        assert validate_identificacion('171317507100') is False

    def test_longitud_14_invalida(self):
        assert validate_identificacion('17131750710011') is False

    def test_empty_string(self):
        assert validate_identificacion('') is False

    def test_none(self):
        assert validate_identificacion(None) is False

    def test_con_letras(self):
        assert validate_identificacion('171317507a') is False

    def test_con_espacios(self):
        assert validate_identificacion('171317 5071') is False

    def test_no_lanza_excepcion_con_input_raro(self):
        # No debe lanzar excepción con ningún input, sólo devolver False.
        assert validate_identificacion('!!!') is False
        assert validate_identificacion(' ') is False
