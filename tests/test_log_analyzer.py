"""Tests for octoprint_klipper.modules.KlipperLogAnalyzer."""
import pytest

from octoprint_klipper.modules import KlipperLogAnalyzer


SAMPLE_LOG = """\
Stats 100.0 mcu: bytes_write=100 bytes_read=50 bytes_retransmit=0 mcu_task_avg=0.001 mcu_task_stddev=0.0005 buffer_time=1.5 print_stall=0
Stats 105.0 mcu: bytes_write=200 bytes_read=60 bytes_retransmit=0 mcu_task_avg=0.002 mcu_task_stddev=0.0005 buffer_time=1.2 print_stall=0
Stats 110.0 mcu: bytes_write=300 bytes_read=70 bytes_retransmit=0 mcu_task_avg=0.001 mcu_task_stddev=0.0005 buffer_time=1.0 print_stall=0
"""


@pytest.fixture
def log_file(tmp_path):
    path = tmp_path / "klippy.log"
    path.write_text(SAMPLE_LOG)
    return str(path)


class TestParseLog:
    def test_parses_stats_lines(self, log_file):
        analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(log_file)
        data = analyzer.parse_log(log_file, None)
        assert len(data) == 3
        assert data[0]["#sampletime"] == 100.0
        assert data[0]["bytes_write"] == "100"
        assert data[1]["#sampletime"] == 105.0
        assert data[2]["#sampletime"] == 110.0

    def test_skips_non_stats_and_zero_write_lines(self, tmp_path):
        path = tmp_path / "mixed.log"
        path.write_text(
            "some random line\n"
            "Stats 1.0 mcu: bytes_write=10\n"
            "Stats 2.0 mcu: bytes_write=0\n"
            "INFO:root:Stats 3.0 mcu: bytes_write=20\n"
        )
        analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(str(path))
        data = analyzer.parse_log(str(path), None)
        # random line skipped, bytes_write=0 line skipped, 2 valid lines remain
        assert len(data) == 2
        assert data[0]["#sampletime"] == 1.0
        assert data[1]["#sampletime"] == 3.0


class TestPlotMcu:
    def test_plot_mcu_structure(self, log_file):
        analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(log_file)
        data = analyzer.parse_log(log_file, None)
        plot = analyzer.plot_mcu(data, analyzer.MAXBANDWIDTH)
        assert set(plot.keys()) == {"times", "bwdeltas", "loads", "awake", "buffers"}
        # first sample is skipped (timedelta == 0), so 2 of 3 points remain
        assert len(plot["times"]) == 2
        assert len(plot["bwdeltas"]) == len(plot["times"])
        assert len(plot["loads"]) == len(plot["times"])
        assert len(plot["awake"]) == len(plot["times"])
        assert len(plot["buffers"]) == len(plot["times"])


class TestAnalyze:
    def test_analyze_returns_plot_and_logdata(self, log_file):
        analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(log_file)
        result = analyzer.analyze()
        assert "plot" in result
        assert "logfiledata" in result
        assert result["logfiledata"] == SAMPLE_LOG

    def test_analyze_with_empty_log(self, tmp_path):
        path = tmp_path / "empty.log"
        path.write_text("no stats here\n")
        analyzer = KlipperLogAnalyzer.KlipperLogAnalyzer(str(path))
        result = analyzer.analyze()
        assert "error" in result["plot"]