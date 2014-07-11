"""
  Copyright 2014 Google Inc. All rights reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
"""

import unittest
from fontTools.ttLib import TTFont
from closure_taker import ClosureTaker
from rle_font import RleFont


class TestRle(unittest.TestCase):

  TEST_FILES = [
      'test_data/rle_copy', 'test_data/rle_fill', 'test_data/rle_fill_x2',
      'test_data/rle_copy_fill', 'test_data/rle_fill_copy']

  def test_rle(self):
    """Test RLE encoding for each test file
    """
    for test_file in self.TEST_FILES:
      rle = RleFont(test_file)
      result_file = open(test_file+'.rle')
      rle.encode()
      self.assertEqual(
          rle.encoded_bytes, result_file.read(),
          "Bad RLE encoding of %s" % test_file)
      result_file.close()

