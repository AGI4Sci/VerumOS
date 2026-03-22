## 上传文件失败:
<用户>: 上传文件：cell_metadata.csv

<System>: 上传失败：Traceback (most recent call last):
File "<string>", line 43, in <module>
df = read_table(file_path)
File "<string>", line 14, in read_table
return pd.read_csv(path)
~~~~~~~~~~~^^^^^^
File "/opt/homebrew/Caskroom/miniconda/base/lib/python3.13/site-packages/pandas/io/parsers/readers.py", line 873, in read_csv
return _read(filepath_or_buffer, kwds)
File "/opt/homebrew/Caskroom/miniconda/base/lib/python3.13/site-packages/pandas/io/parsers/readers.py", line 300, in _read
parser = TextFileReader(filepath_or_buffer, **kwds)
File "/opt/homebrew/Caskroom/miniconda/base/lib/python3.13/site-packages/pandas/io/parsers/readers.py", line 1645, in __init__
self._engine = self._make_engine(f, self.engine)
~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^
File "/opt/homebrew/Caskroom/miniconda/base/lib/python3.13/site-packages/pandas/io/parsers/readers.py", line 1922, in _make_engine
return mapping[engine](f, **self.options)
~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^
File "/opt/homebrew/Caskroom/miniconda/base/lib/python3.13/site-packages/pandas/io/parsers/c_parser_wrapper.py", line 95, in __init__
self._reader = parsers.TextReader(src, **kwds)
~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^
File "pandas/_libs/parsers.pyx", line 568, in pandas._libs.parsers.TextReader.__cinit__
File "pandas/_libs/parsers.pyx", line 657, in pandas._libs.parsers.TextReader._get_header
File "pandas/_libs/parsers.pyx", line 868, in pandas._libs.parsers.TextReader._tokenize_rows
File "pandas/_libs/parsers.pyx", line 885, in pandas._libs.parsers.TextReader._check_tokenize_status
File "pandas/_libs/parsers.pyx", line 2076, in pandas._libs.parsers.raise_parser_error
File "<frozen codecs>", line 325, in decode
UnicodeDecodeError: 'utf-8' codec can't decode byte 0x9e in position 40: invalid start byte